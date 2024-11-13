import assert from "node:assert";
import { randomUUID } from "node:crypto";
import chalk from "chalk";
import { Miniflare, Mutex } from "miniflare";
import * as MF from "../../dev/miniflare";
import { logger } from "../../logger";
import { castErrorCause } from "./events";
import {
	convertToConfigBundle,
	LocalRuntimeController,
} from "./LocalRuntimeController";
import type { BundleCompleteEvent } from "./events";

export class MultiworkerRuntimeController extends LocalRuntimeController {
	// ******************
	//   Event Handlers
	// ******************

	#log = MF.buildLog();
	#currentBundleId = 0;

	// This is given as a shared secret to the Proxy and User workers
	// so that the User Worker can trust aspects of HTTP requests from the Proxy Worker
	// if it provides the secret in a `MF-Proxy-Shared-Secret` header.
	#proxyToUserWorkerAuthenticationSecret = randomUUID();

	// `buildMiniflareOptions()` is asynchronous, meaning if multiple bundle
	// updates were submitted, the second may apply before the first. Therefore,
	// wrap updates in a mutex, so they're always applied in invocation order.
	#mutex = new Mutex();
	#mf?: Miniflare;

	#options = new Map<string, { options: MF.Options; primary: boolean }>();

	#hasPrimaryWorker() {
		return [...this.#options.values()].some((o) => o.primary);
	}

	#mergedMfOptions(): MF.Options {
		const primary = [...this.#options.values()].find((o) => o.primary);
		assert(primary !== undefined);

		const secondary = [...this.#options.values()].filter((o) => !o.primary);

		return {
			...primary.options,
			workers: [
				...primary.options.workers,
				...secondary.flatMap((o) =>
					o.options.workers.map((w) => {
						// TODO: investigate why ratelimits causes everything to crash
						delete w.ratelimits;
						return w;
					})
				),
			],
		};
	}

	async #onBundleComplete(data: BundleCompleteEvent, id: number) {
		try {
			const { options } = await MF.buildMiniflareOptions(
				this.#log,
				await convertToConfigBundle(data),
				this.#proxyToUserWorkerAuthenticationSecret
			);

			this.#options.set(data.config.name, {
				options,
				primary: Boolean(data.config.dev.multiworkerPrimary),
			});

			if (this.#hasPrimaryWorker()) {
				const mergedMfOptions = this.#mergedMfOptions();

				if (this.#mf === undefined) {
					logger.log(chalk.dim("⎔ Starting local server..."));
					this.#mf = new Miniflare(mergedMfOptions);
				} else {
					logger.log(chalk.dim("⎔ Reloading local server..."));

					await this.#mf.setOptions(mergedMfOptions);
				}

				// All asynchronous `Miniflare` methods will wait for all `setOptions()`
				// calls to complete before resolving. To ensure we get the `url` and
				// `inspectorUrl` for this set of `options`, we protect `#mf` with a mutex,
				// so only one update can happen at a time.
				const userWorkerUrl = await this.#mf.ready;
				const userWorkerInspectorUrl = await this.#mf.getInspectorURL();
				// If we received a new `bundleComplete` event before we were able to
				// dispatch a `reloadComplete` for this bundle, ignore this bundle.
				if (id !== this.#currentBundleId) {
					return;
				}

				this.emitReloadCompleteEvent({
					type: "reloadComplete",
					config: data.config,
					bundle: data.bundle,
					proxyData: {
						userWorkerUrl: {
							protocol: userWorkerUrl.protocol,
							hostname: userWorkerUrl.hostname,
							port: userWorkerUrl.port,
						},
						userWorkerInspectorUrl: {
							protocol: userWorkerInspectorUrl.protocol,
							hostname: userWorkerInspectorUrl.hostname,
							port: userWorkerInspectorUrl.port,
							pathname: `/core:user:${data.config.name}`,
						},
						userWorkerInnerUrlOverrides: {
							protocol: data.config?.dev?.origin?.secure ? "https:" : "http:",
							hostname: data.config?.dev?.origin?.hostname,
							port: data.config?.dev?.origin?.hostname ? "" : undefined,
						},
						headers: {
							// Passing this signature from Proxy Worker allows the User Worker to trust the request.
							"MF-Proxy-Shared-Secret":
								this.#proxyToUserWorkerAuthenticationSecret,
						},
						liveReload: data.config.dev?.liveReload,
						proxyLogsToController:
							data.bundle.entry.format === "service-worker",

						// It's not possible to bind to Workers in a multi-worker setup across the dev registry, so these are intentionally left empty
						internalDurableObjects: [],
						entrypointAddresses: {},
					},
				});
			}
		} catch (error) {
			this.emitErrorEvent({
				type: "error",
				reason: "Error reloading local server",
				cause: castErrorCause(error),
				source: "MultiworkerRuntimeController",
				data: undefined,
			});
		}
	}
	onBundleComplete(data: BundleCompleteEvent) {
		const id = ++this.#currentBundleId;

		if (data.config.dev?.remote) {
			this.emitErrorEvent({
				type: "error",
				reason: "--remote workers not supported with the multiworker runtime",
				cause: new Error(
					"--remote workers not supported with the multiworker runtime"
				),
				source: "MultiworkerRuntimeController",
				data: undefined,
			});
			return;
		}

		this.emitReloadStartEvent({
			type: "reloadStart",
			config: data.config,
			bundle: data.bundle,
		});

		void this.#mutex.runWith(() => this.#onBundleComplete(data, id));
	}
}
