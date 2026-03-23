import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

interface GitHubContentEntry {
    name: string;
    type: string;
    download_url: string | null;
}

export class SVDResolver {
    private readonly cacheDir: string;
    private readonly outputChannel: vscode.OutputChannel;

    constructor(storagePath: string, outputChannel: vscode.OutputChannel) {
        this.cacheDir = path.join(storagePath, 'svd');
        this.outputChannel = outputChannel;
    }

    async resolveSvdFile(configuredSvdPath: string, chipName: string): Promise<string | undefined> {
        const configured = this.resolveConfiguredPath(configuredSvdPath);
        if (configured) {
            return configured;
        }

        const workspaceSvd = await this.findWorkspaceSvd(chipName);
        if (workspaceSvd) {
            return workspaceSvd;
        }

        return this.downloadSvdFile(chipName);
    }

    private resolveConfiguredPath(configuredSvdPath: string): string | undefined {
        if (!configuredSvdPath) {
            return undefined;
        }

        if (path.isAbsolute(configuredSvdPath) && fs.existsSync(configuredSvdPath)) {
            return configuredSvdPath;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return undefined;
        }

        const candidate = path.join(workspaceFolder.uri.fsPath, configuredSvdPath);
        return fs.existsSync(candidate) ? candidate : undefined;
    }

    private async findWorkspaceSvd(chipName: string): Promise<string | undefined> {
        try {
            const svdFiles = await vscode.workspace.findFiles('**/*.svd', '**/node_modules/**', 20);
            if (svdFiles.length === 0) {
                return undefined;
            }

            const match = this.pickBestSvdMatch(
                svdFiles.map(file => ({ name: path.basename(file.fsPath), filePath: file.fsPath })),
                chipName
            );
            return match?.filePath;
        } catch {
            return undefined;
        }
    }

    private async downloadSvdFile(chipName: string): Promise<string | undefined> {
        if (!chipName) {
            return undefined;
        }

        fs.mkdirSync(this.cacheDir, { recursive: true });

        const cachedFiles = fs.readdirSync(this.cacheDir)
            .filter(name => name.toLowerCase().endsWith('.svd'))
            .map(name => ({ name, filePath: path.join(this.cacheDir, name) }));
        const cachedMatch = this.pickBestSvdMatch(cachedFiles, chipName);
        if (cachedMatch) {
            return cachedMatch.filePath;
        }

        try {
            const entries = await this.fetchStMicroSvdIndex();
            const match = this.pickBestSvdMatch(
                entries
                    .filter(entry => entry.type === 'file' && entry.download_url && entry.name.toLowerCase().endsWith('.svd'))
                    .map(entry => ({ name: entry.name, downloadUrl: entry.download_url! })),
                chipName
            );

            if (!match?.downloadUrl) {
                return undefined;
            }

            const localPath = path.join(this.cacheDir, match.name);
            await this.downloadToFile(match.downloadUrl, localPath);
            this.outputChannel.appendLine(`已下载 SVD 文件: ${match.name}`);
            return localPath;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.outputChannel.appendLine(`下载 SVD 文件失败: ${message}`);
            return undefined;
        }
    }

    private async fetchStMicroSvdIndex(): Promise<GitHubContentEntry[]> {
        const url = 'https://api.github.com/repos/cmsis-svd/cmsis-svd-data/contents/data/STMicro';
        const body = await this.fetchText(url, {
            'User-Agent': 'stm32-dev-tools',
            'Accept': 'application/vnd.github+json'
        });
        return JSON.parse(body) as GitHubContentEntry[];
    }

    private async downloadToFile(url: string, localPath: string): Promise<void> {
        const content = await this.fetchText(url, {
            'User-Agent': 'stm32-dev-tools'
        });
        fs.writeFileSync(localPath, content, 'utf8');
    }

    private fetchText(url: string, headers: Record<string, string>): Promise<string> {
        return new Promise((resolve, reject) => {
            https.get(url, { headers }, response => {
                if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
                    reject(new Error(`HTTP ${response.statusCode || 'unknown'}`));
                    response.resume();
                    return;
                }

                let data = '';
                response.setEncoding('utf8');
                response.on('data', chunk => data += chunk);
                response.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    private pickBestSvdMatch<T extends { name: string }>(items: T[], chipName: string): T | undefined {
        const scored = items
            .map(item => ({ item, score: this.scoreSvdName(item.name, chipName) }))
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score);
        return scored[0]?.item;
    }

    private scoreSvdName(fileName: string, chipName: string): number {
        const baseName = path.basename(fileName, '.svd').toUpperCase();
        const chip = chipName.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!chip.startsWith('STM32')) {
            return 0;
        }

        const seriesMatch = chip.match(/^(STM32[A-Z]\d{3})/);
        if (!seriesMatch) {
            return 0;
        }

        const series = seriesMatch[1];
        const tail = chip.slice(series.length);
        const packageCode = tail[0];
        const memoryCode = tail[1];
        const variants = new Set<string>([
            chip,
            series,
            `${series}XX`
        ]);

        if (tail.length >= 2) {
            variants.add(`${series}${tail.slice(0, 2)}`);
        }
        if (memoryCode && /[A-Z]/.test(memoryCode)) {
            variants.add(`${series}${memoryCode}`);
            variants.add(`${series}X${memoryCode}`);
        }
        if (packageCode && memoryCode && /[A-Z]/.test(packageCode) && /[A-Z]/.test(memoryCode)) {
            variants.add(`${series}${packageCode}${memoryCode}`);
        }

        if (variants.has(baseName)) {
            return 1000;
        }

        let score = 0;
        if (baseName.startsWith(series)) {
            score += 300;
        } else {
            return 0;
        }

        if (baseName.includes('XX')) {
            score += 120;
        }

        if (memoryCode && /[A-Z]/.test(memoryCode) && baseName.includes(`X${memoryCode}`)) {
            score += 240;
        }

        if (packageCode && memoryCode && /[A-Z]/.test(packageCode) && /[A-Z]/.test(memoryCode) && baseName.includes(`${packageCode}${memoryCode}`)) {
            score += 260;
        }

        if (tail.length >= 2 && baseName.includes(tail.slice(0, 2))) {
            score += 160;
        }

        return score;
    }
}
