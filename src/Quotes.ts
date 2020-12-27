import { ok } from "assert";
import { Dirent, PathLike, promises, readdir } from "fs";
import { basename, extname, join, resolve as resolvePath } from "path";
import { int } from "random";
const allowedExtensions = new Set([".mp3", ".ogg"]);

export class Quotes {
    public static async indexDir(directory: PathLike) {
        const quotesObj = new Quotes();
        quotesObj.indexDir = directory;
        const moduleDirs = (await readdirAsync(directory)).filter((path) => path.isDirectory());

        const loaders = moduleDirs.map(async (dir) => {
            const moduleQuotes: string[] = [];
            const files = (await readdirAsync(dir.name)).filter((path) =>
                path.isFile() && allowedExtensions.has(extname(path.name)));
            for (const file of files) {
                const quoteName = basename(file.name, extname(file.name));
                ok(!quotesObj.quotes.has(quoteName), "Duplicate Quote: " + quoteName);
                moduleQuotes.push(quoteName);
                quotesObj.quotes.set(quoteName, file.name);
            }

            quotesObj.modules.set(basename(dir.name), moduleQuotes);
        });

        await Promise.all(loaders);

        return quotesObj;
    }

    private modules = new Map<string, string[]>();
    private quotes = new Map<string, PathLike>();
    private indexDir: PathLike;
    public getQuote(name: string) {
        if (!this.quotes.has(name)) {
            return undefined;
        }
        return resolvePath(this.quotes.get(name).toString());
    }
    public getRandomQuote(moduleName?: string) {
        if (moduleName !== undefined && moduleName.trim() !== "") {
            if (!this.modules.has(moduleName)) {
                return undefined;
            }

            const module = this.getModuleQuotes(moduleName);
            return this.getQuote(module[int(0, module.length - 1)]);
        } else {
            const allQuotes = Array.from(this.quotes.values());
            return allQuotes[int(0, allQuotes.length - 1)].toString();
        }
    }

    public getModules(): string[] {
        return Array.from(this.modules.keys());
    }

    public getModuleQuotes(module: string) {
        return this.modules.get(module);
    }

    public isValidQuoteFile(filename: string) {
        return allowedExtensions.has(extname(filename)) && filename.match("^[a-zA-Z0-9]+.[a-zA-Z0-9]+$") !== null;
    }

    public getAllowedExtensions() {
        return allowedExtensions;
    }

    public async addQuoteToModule(moduleName: string, quote: { file: Buffer, name: string }) {
        ok(this.isValidQuoteFile(quote.name));
        ok(this.modules.has(moduleName));
        const fullName = join(this.indexDir.toString(), moduleName, quote.name);
        await promises.writeFile(
            fullName,
            quote.file);
        const quoteName = basename(quote.name, extname(quote.name));
        this.modules.get(moduleName).push(quoteName);
        this.quotes.set(quoteName, fullName);
    }
}

function readdirAsync(path: PathLike) {
    return new Promise<Dirent[]>((resolve, reject) => {
        readdir(path, { withFileTypes: true }, (err, fileNames) => {
            if (err !== undefined && err !== null) {
                reject(err);
            }

            resolve(fileNames.map((dirent) => {
                dirent.name = join(path.toString(), dirent.name);
                return dirent;
            }));
        });
    });
}
