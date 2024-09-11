import { SELF } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyConfigurationDefaults } from "../../packages/workers-shared/asset-worker/src/configuration";
import Worker from "../../packages/workers-shared/asset-worker/src/index";
import { getAssetWithMetadataFromKV } from "../../packages/workers-shared/asset-worker/src/utils/kv";
import type { AssetMetadata } from "../../packages/workers-shared/asset-worker/src/utils/kv";

const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

vi.mock("../../packages/workers-shared/asset-worker/src/utils/kv.ts");
vi.mock("../../packages/workers-shared/asset-worker/src/configuration");
const existsMock = (fileList: Set<string>) => {
	vi.spyOn(Worker.prototype, "exists").mockImplementation(
		async (pathname: string) => {
			if (fileList.has(pathname)) {
				return pathname;
			}
		}
	);
};
const BASE_URL = "http://example.com";

type TestCase = {
	title: string;
	files: string[];
	requestPath: string;
	matchedFile?: string;
	finalPath?: string;
};

const testCases: {
	htmlHandling:
		| "auto-trailing-slash"
		| "drop-trailing-slash"
		| "force-trailing-slash"
		| "none";
	cases: TestCase[];
}[] = [
	{
		htmlHandling: "auto-trailing-slash",
		cases: [
			{
				title: "/ -> 200 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/index -> / 307 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/index.html -> / 307 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/both -> 200 (with /both.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both",
				matchedFile: "/both.html",
				finalPath: "/both",
			},
			{
				title: "/both.html -> /both 307 (with /both.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both",
				matchedFile: "/both.html",
				finalPath: "/both",
			},
			{
				title: "/both/ -> 200 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			{
				title: "/both/index.html -> /both/ 307 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index.html",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			{
				title: "/both/index -> /both/ 307 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			{
				title: "/file -> 200 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file.html -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file.html",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file/ -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file/index -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/index",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file/index.html -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/index.html",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/folder -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder.html -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder.html",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder/ -> 200 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder/index -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/index",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder/index.html -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/index.html",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/bin -> /bin/ 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin.html -> /bin/ 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin.html",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin%2F -> 200 (with /bin%2F)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin%2F",
				matchedFile: "/bin%2F",
				finalPath: "/bin%2F",
			},
			{
				title: "/bin/ -> 200 (with /bin/index.html not /bin%2F",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin/index -> 307 /bin/ (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin/index.html -> 307 /bin/ (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index.html",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			// prefers exact match
			{
				title: "/file-bin -> 200 ",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin",
				matchedFile: "/file-bin",
				finalPath: "/file-bin",
			},
			// (doesn't rewrite if resulting path would match another asset)
			{
				title: "/file-bin.html -> 200 ",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin.html",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin.html",
			},
			// (finds file-bin.html --rewrite--> /file-bin, but /file-bin exists)
			{
				title: "/file-bin/ -> 404 ",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/",
			},
			{
				title: "/file-bin/index -> 404 ",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index",
			},
			{
				title: "/file-bin/index.html -> 404 ",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index.html",
			},
		],
	},
	{
		htmlHandling: "drop-trailing-slash",
		cases: [
			// note that we don't drop the "/" if that is the only path component
			{
				title: "/ -> 200 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/index -> / 307 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/index.html -> / 307 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/both -> 200 (with /both.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both",
				matchedFile: "/both.html",
				finalPath: "/both",
			},
			{
				title: "/both.html -> /both 307 (with /both.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both.html",
				matchedFile: "/both.html",
				finalPath: "/both",
			},
			// drops trailing slash and so it tries /both.html first
			{
				title: "/both/ -> /both 307 (with /both.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/",
				matchedFile: "/both.html",
				finalPath: "/both",
			},
			{
				title: "/both/index -> 307 (with /both.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index",
				matchedFile: "/both.html",
				finalPath: "/both",
			},
			// can't rewrite /both/index.html: would be /both/ -> /both -> /both.html
			// ie can only access /both/index.html by exact match
			{
				title: "/both/index.html -> 200 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index.html",
				matchedFile: "/both/index.html",
				finalPath: "/both/index.html",
			},
			{
				title: "/file -> 200 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file.html -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file.html",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file/ -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file/index -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/index",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/file/index.html -> /file 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/index.html",
				matchedFile: "/file.html",
				finalPath: "/file",
			},
			{
				title: "/folder -> 200 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder",
				matchedFile: "/folder/index.html",
				finalPath: "/folder",
			},
			{
				title: "/folder.html -> /folder 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder.html",
				matchedFile: "/folder/index.html",
				finalPath: "/folder",
			},
			{
				title: "/folder/ -> /folder 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/",
				matchedFile: "/folder/index.html",
				finalPath: "/folder",
			},
			{
				title: "/folder/index -> /folder 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/index",
				matchedFile: "/folder/index.html",
				finalPath: "/folder",
			},
			{
				title: "/folder/index.html -> /folder 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/index.html",
				matchedFile: "/folder/index.html",
				finalPath: "/folder",
			},
			{
				title: "/bin -> 200 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin",
				matchedFile: "/bin/index.html",
				finalPath: "/bin",
			},
			{
				title: "/bin.html -> /bin 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin.html",
				matchedFile: "/bin/index.html",
				finalPath: "/bin",
			},
			{
				title: "/bin%2F -> 200 (with /bin%2F)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin%2F",
				matchedFile: "/bin%2F",
				finalPath: "/bin%2F",
			},
			{
				title: "/bin/ -> /bin 307 (with /bin/index.html not /bin%2F",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/",
				matchedFile: "/bin/index.html",
				finalPath: "/bin",
			},
			{
				title: "/bin/index -> /bin 307 (with /bin/index.html not /bin%2F",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index",
				matchedFile: "/bin/index.html",
				finalPath: "/bin",
			},
			{
				title: "/bin/index.html -> /bin 307 (with /bin/index.html not /bin%2F",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index.html",
				matchedFile: "/bin/index.html",
				finalPath: "/bin",
			},
			{
				title: "/file-bin -> 200",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin",
				matchedFile: "/file-bin",
				finalPath: "/file-bin",
			},
			// doesn't redirect to /file-bin because that also exists
			{
				title: "/file-bin.html -> 200 (with /file-bin.html)",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin.html",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin.html",
			},
			// 404s because ambiguity between /file-bin or /file-bin.html?
			{
				title: "/file-bin/ -> 404",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/",
			},
			{
				title: "/file-bin/index -> 404",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index",
			},
			{
				title: "/file-bin/index.html -> 404",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index.html",
			},
		],
	},
	{
		htmlHandling: "force-trailing-slash",
		cases: [
			{
				title: "/ -> 200 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/index -> / 307 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			{
				title: "/index.html -> / 307 (with /index.html)",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/",
			},
			// ie tries /both/index.html first
			{
				title: "/both -> /both/ 307 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			// can't rewrite /both.html: would be /both -> /both/ -> /both/index.html
			// ie can only access /both.html by exact match
			{
				title: "/both.html -> 200",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both.html",
				matchedFile: "/both.html",
				finalPath: "/both.html",
			},
			{
				title: "/both/ -> 200 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			{
				title: "/both/index -> /both/ 307 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			{
				title: "/both/index.html -> /both/ 307 (with /both/index.html)",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index.html",
				matchedFile: "/both/index.html",
				finalPath: "/both/",
			},
			// always ends in a trailing slash
			{
				title: "/file -> /file/ 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file",
				matchedFile: "/file.html",
				finalPath: "/file/",
			},
			{
				title: "/file.html -> /file/ 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file.html",
				matchedFile: "/file.html",
				finalPath: "/file/",
			},

			{
				title: "/file/ -> 200 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/",
				matchedFile: "/file.html",
				finalPath: "/file/",
			},
			{
				title: "/file/index -> /file/ 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/index",
				matchedFile: "/file.html",
				finalPath: "/file/",
			},
			{
				title: "/file/index.html -> /file/ 307 (with file.html)",
				files: ["/file.html"],
				requestPath: "/file/index.html",
				matchedFile: "/file.html",
				finalPath: "/file/",
			},
			{
				title: "/folder -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder.html -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder.html",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder/ -> 200 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder/index -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/index",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/folder/index.html -> /folder/ 307 (with /folder/index.html)",
				files: ["/folder/index.html"],
				requestPath: "/folder/index.html",
				matchedFile: "/folder/index.html",
				finalPath: "/folder/",
			},
			{
				title: "/bin -> /bin/ 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin.html -> /bin/ 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin.html",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin%2F -> 200 (with /bin%2F)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin%2F",
				matchedFile: "/bin%2F",
				finalPath: "/bin%2F",
			},
			{
				title: "/bin/ -> 200 (with /bin/index.html not /bin%2F",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin/index -> /bin/ 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			{
				title: "/bin/index.html -> /bin/ 307 (with /bin/index.html)",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index.html",
				matchedFile: "/bin/index.html",
				finalPath: "/bin/",
			},
			// doesn't force a trailing slash here because it would redirect to /file-bin.html
			{
				title: "/file-bin -> 200",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin",
				matchedFile: "/file-bin",
				finalPath: "/file-bin",
			},
			{
				title: "/file-bin.html -> /file-bin/ 307 (with /file-bin.html)",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin.html",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin/",
			},
			{
				title: "/file-bin/ -> 200",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin/",
			},
			{
				title: "/file-bin/index -> /file-bin/ 307 (with /file-bin.html)",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin/",
			},
			{
				title: "/file-bin/index.html -> /file-bin/ 307 (with /file-bin.html)",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index.html",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin/",
			},
		],
	},
	{
		htmlHandling: "none",
		cases: [
			{
				title: "/ -> 404",
				files: ["/index.html"],
				requestPath: "/",
			},
			{
				title: "/index -> 404",
				files: ["/index.html"],
				requestPath: "/index",
			},
			{
				title: "/index.html -> 200",
				files: ["/index.html"],
				requestPath: "/index.html",
				matchedFile: "/index.html",
				finalPath: "/index.html",
			},
			{
				title: "/both -> 404",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both",
			},
			{
				title: "/both.html -> 200",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both.html",
				matchedFile: "/both.html",
				finalPath: "/both.html",
			},
			{
				title: "/both/ -> 404",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/",
			},
			{
				title: "/both/index.html -> 200",
				files: ["/both.html", "/both/index.html"],
				requestPath: "/both/index.html",
				matchedFile: "/both/index.html",
				finalPath: "/both/index.html",
			},
			{
				title: "/file/index.html -> 404",
				files: ["/file.html"],
				requestPath: "/file/index.html",
			},
			{
				title: "/folder.html -> 404",
				files: ["/folder/index.html"],
				requestPath: "/folder.html",
			},
			{
				title: "/bin -> 404",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin",
			},
			{
				title: "/bin.html -> 404",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin.html",
			},
			{
				title: "/bin%2F -> 200",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin%2F",
				matchedFile: "/bin%2F",
				finalPath: "/bin%2F",
			},
			{
				title: "/bin/ -> 404",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/",
			},
			{
				title: "/bin/index -> 404",
				files: ["/bin%2F", "/bin/index.html"],
				requestPath: "/bin/index",
			},
			{
				title: "/file-bin -> 200",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin",
				matchedFile: "/file-bin",
				finalPath: "/file-bin",
			},
			{
				title: "/file-bin.html -> 200",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin.html",
				matchedFile: "/file-bin.html",
				finalPath: "/file-bin.html",
			},
			{
				title: "/file-bin/ -> 404",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/",
			},
			{
				title: "/file-bin/index -> 404",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index",
			},
			{
				title: "/file-bin/index.html -> 404",
				files: ["/file-bin", "/file-bin.html"],
				requestPath: "/file-bin/index.html",
			},
		],
	},
];

describe("htmlHanding options", () => {
	beforeEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockImplementation(
			() =>
				Promise.resolve({
					value: "no-op",
					metadata: {
						contentType: "no-op",
					},
				}) as unknown as Promise<
					KVNamespaceGetWithMetadataResult<ReadableStream, AssetMetadata>
				>
		);
	});
	afterEach(() => {
		vi.mocked(getAssetWithMetadataFromKV).mockRestore();
	});
	describe.each(testCases)(`$htmlHandling`, ({ htmlHandling, cases }) => {
		beforeEach(() => {
			vi.mocked(applyConfigurationDefaults).mockImplementation(() => {
				return {
					htmlHandling,
					notFoundHandling: "none",
				};
			});
		});
		it.each(cases)(
			"$title",
			async ({ files, requestPath, matchedFile, finalPath }) => {
				existsMock(new Set(files));
				const request = new IncomingRequest(BASE_URL + requestPath);
				let response = await SELF.fetch(request);
				if (matchedFile && finalPath) {
					expect(getAssetWithMetadataFromKV).toBeCalledTimes(1);
					expect(getAssetWithMetadataFromKV).toBeCalledWith(
						undefined,
						matchedFile
					);
					expect(response.status).toBe(200);
					expect(response.url).toBe(BASE_URL + finalPath);
					// can't check intermediate 307 directly:
					expect(response.redirected).toBe(requestPath !== finalPath);
				} else {
					expect(getAssetWithMetadataFromKV).not.toBeCalled();
					expect(response.status).toBe(404);
				}
			}
		);
	});
});