import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import * as tls from 'tls';
import { spawn, execSync } from 'child_process';
import { DetectedTools } from './toolchainDetector';

export type ToolName = 'gcc-arm' | 'cmake' | 'ninja' | 'openocd';

const TOOL_DISPLAY_NAMES: Record<ToolName, string> = {
    'gcc-arm': 'GCC ARM 工具链',
    'cmake': 'CMake',
    'ninja': 'Ninja',
    'openocd': 'OpenOCD'
};

const MANUAL_INSTALL_URLS: Record<ToolName, string> = {
    'gcc-arm': 'https://developer.arm.com/downloads/-/arm-gnu-toolchain-downloads',
    'cmake': 'https://cmake.org/download/',
    'ninja': 'https://ninja-build.org/',
    'openocd': 'https://github.com/xpack-dev-tools/openocd-xpack/releases'
};

export function getToolDisplayName(tool: ToolName): string {
    return TOOL_DISPLAY_NAMES[tool];
}

export function getMissingTools(tools: DetectedTools): ToolName[] {
    const missing: ToolName[] = [];
    if (!tools.gccPath) { missing.push('gcc-arm'); }
    if (!tools.cmakePath) { missing.push('cmake'); }
    if (!tools.ninjaPath) { missing.push('ninja'); }
    if (!tools.openocdPath) { missing.push('openocd'); }
    return missing;
}

export class ToolchainInstaller {
    private globalStoragePath: string;
    private outputChannel: vscode.OutputChannel;

    constructor(globalStoragePath: string, outputChannel: vscode.OutputChannel) {
        this.globalStoragePath = globalStoragePath;
        this.outputChannel = outputChannel;
    }

    get toolsDir(): string {
        return path.join(this.globalStoragePath, 'tools');
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(`[Installer] ${msg}`);
    }

    private getProxyUrl(): string | undefined {
        const fromVscode = vscode.workspace.getConfiguration('http').get<string>('proxy');
        if (fromVscode) { return fromVscode; }

        const fromEnv = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
            || process.env.https_proxy || process.env.http_proxy;
        if (fromEnv) { return fromEnv; }

        if (process.platform === 'win32') {
            return this.detectWindowsSystemProxy();
        }
        return undefined;
    }

    private detectWindowsSystemProxy(): string | undefined {
        try {
            const enableResult = execSync(
                'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable',
                { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
            if (!enableResult.includes('0x1')) { return undefined; }

            const serverResult = execSync(
                'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer',
                { encoding: 'utf8', timeout: 3000, stdio: ['pipe', 'pipe', 'pipe'] }
            );
            const match = serverResult.match(/ProxyServer\s+REG_SZ\s+(.+)/);
            if (!match) { return undefined; }

            const proxy = match[1].trim();
            if (proxy.includes('=')) {
                const httpsMatch = proxy.match(/https=([^;]+)/);
                if (httpsMatch) { return `http://${httpsMatch[1]}`; }
                const httpMatch = proxy.match(/http=([^;]+)/);
                if (httpMatch) { return `http://${httpMatch[1]}`; }
            }
            return proxy.startsWith('http') ? proxy : `http://${proxy}`;
        } catch {
            return undefined;
        }
    }

    private hasCurl(): boolean {
        try {
            const bin = process.platform === 'win32' ? 'curl.exe' : 'curl';
            execSync(`${bin} --version`, { stdio: 'pipe', timeout: 5000 });
            return true;
        } catch {
            return false;
        }
    }

    async installMissing(missing: ToolName[]): Promise<DetectedTools> {
        this.log(`========== 开始安装工具链 ==========`);
        this.log(`待安装: ${missing.map(t => TOOL_DISPLAY_NAMES[t]).join(', ')}`);
        this.log(`安装目录: ${this.toolsDir}`);

        const proxy = this.getProxyUrl();
        if (proxy) {
            this.log(`检测到代理: ${proxy}`);
        } else {
            this.log(`未检测到代理，如需代理请在 VS Code 设置 http.proxy`);
        }

        return vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'STM32: 安装工具链',
            cancellable: true
        }, async (progress, token) => {
            const result: DetectedTools = {};

            for (let i = 0; i < missing.length; i++) {
                if (token.isCancellationRequested) {
                    this.log('用户取消安装');
                    break;
                }

                const tool = missing[i];
                const displayName = TOOL_DISPLAY_NAMES[tool];

                progress.report({
                    message: `(${i + 1}/${missing.length}) 正在下载 ${displayName}...`
                });

                try {
                    const paths = await this.installTool(tool, (downloaded, _total) => {
                        const dlMB = (downloaded / 1024 / 1024).toFixed(1);
                        progress.report({
                            message: `(${i + 1}/${missing.length}) 正在下载 ${displayName} (${dlMB} MB)`
                        });
                    }, token);
                    Object.assign(result, paths);
                    this.log(`✓ ${displayName} 安装成功`);
                } catch (err) {
                    this.log(`✗ ${displayName} 安装失败: ${err}`);
                    const manualUrl = MANUAL_INSTALL_URLS[tool];
                    const errMsg = proxy
                        ? `${displayName} 自动安装失败`
                        : `${displayName} 自动安装失败，国内用户请在 VS Code 设置 http.proxy 配置代理`;
                    const choice = await vscode.window.showErrorMessage(
                        errMsg,
                        '打开下载页面'
                    );
                    if (choice === '打开下载页面') {
                        vscode.env.openExternal(vscode.Uri.parse(manualUrl));
                    }
                }
            }

            this.log(`========== 安装完成 ==========`);
            return result;
        });
    }

    private async installTool(
        tool: ToolName,
        onProgress: (downloaded: number, total: number) => void,
        token?: vscode.CancellationToken
    ): Promise<DetectedTools> {
        const urls = this.getDownloadUrls(tool);
        if (urls.length === 0) {
            throw new Error(`不支持当前平台: ${process.platform} ${process.arch}`);
        }

        const toolDir = path.join(this.toolsDir, tool);

        if (fs.existsSync(toolDir)) {
            this.log(`清理旧安装: ${toolDir}`);
            fs.rmSync(toolDir, { recursive: true, force: true });
        }
        fs.mkdirSync(toolDir, { recursive: true });

        let lastError: Error | null = null;

        for (let urlIdx = 0; urlIdx < urls.length; urlIdx++) {
            if (token?.isCancellationRequested) {
                throw new Error('已取消');
            }

            const url = urls[urlIdx];
            const ext = this.getArchiveExtension(url);
            const tempFile = path.join(os.tmpdir(), `stm32-${tool}-${Date.now()}${ext}`);

            try {
                this.log(`[${urlIdx + 1}/${urls.length}] 下载: ${url}`);
                await this.downloadFile(url, tempFile, onProgress, token);

                const fileSize = fs.existsSync(tempFile) ? fs.statSync(tempFile).size : 0;
                this.log(`下载完成: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);

                this.log(`正在解压到: ${toolDir}`);
                await this.extractArchive(tempFile, toolDir);
                this.log(`解压完成`);

                this.flattenDirectory(toolDir);

                try { fs.unlinkSync(tempFile); } catch {}

                const paths = this.getInstalledPaths(tool);
                if (Object.values(paths).some(v => !!v)) {
                    this.log(`安装路径: ${JSON.stringify(paths)}`);
                    return paths;
                }
                throw new Error('解压后未找到可执行文件');
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
                this.log(`源 ${urlIdx + 1} 失败: ${lastError.message}`);
                try { fs.unlinkSync(tempFile); } catch {}
            }
        }

        throw lastError || new Error('所有下载源均失败');
    }

    private getDownloadUrls(tool: ToolName): string[] {
        const p = process.platform;
        const a = process.arch;

        switch (tool) {
            case 'gcc-arm':
                if (p === 'win32') {
                    return [
                        'https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-mingw-w64-i686-arm-none-eabi.zip',
                        'https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v13.2.1-1.1/xpack-arm-none-eabi-gcc-13.2.1-1.1-win32-x64.zip'
                    ];
                }
                if (p === 'linux') {
                    return a === 'arm64'
                        ? ['https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-aarch64-arm-none-eabi.tar.xz']
                        : ['https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-x86_64-arm-none-eabi.tar.xz'];
                }
                if (p === 'darwin') {
                    return a === 'arm64'
                        ? ['https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-darwin-arm64-arm-none-eabi.tar.xz']
                        : ['https://developer.arm.com/-/media/Files/downloads/gnu/13.2.rel1/binrel/arm-gnu-toolchain-13.2.rel1-darwin-x86_64-arm-none-eabi.tar.xz'];
                }
                return [];

            case 'cmake':
                if (p === 'win32') {
                    return ['https://github.com/Kitware/CMake/releases/download/v3.28.1/cmake-3.28.1-windows-x86_64.zip'];
                }
                if (p === 'linux') {
                    return ['https://github.com/Kitware/CMake/releases/download/v3.28.1/cmake-3.28.1-linux-x86_64.tar.gz'];
                }
                if (p === 'darwin') {
                    return ['https://github.com/Kitware/CMake/releases/download/v3.28.1/cmake-3.28.1-macos-universal.tar.gz'];
                }
                return [];

            case 'ninja':
                if (p === 'win32') {
                    return ['https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-win.zip'];
                }
                if (p === 'linux') {
                    return ['https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-linux.zip'];
                }
                if (p === 'darwin') {
                    return ['https://github.com/ninja-build/ninja/releases/download/v1.12.1/ninja-mac.zip'];
                }
                return [];

            case 'openocd':
                if (p === 'win32') {
                    return ['https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-win32-x64.zip'];
                }
                if (p === 'linux') {
                    return a === 'arm64'
                        ? ['https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-linux-arm64.tar.gz']
                        : ['https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-linux-x64.tar.gz'];
                }
                if (p === 'darwin') {
                    return a === 'arm64'
                        ? ['https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-darwin-arm64.tar.gz']
                        : ['https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-2/xpack-openocd-0.12.0-2-darwin-x64.tar.gz'];
                }
                return [];
        }
    }

    private async downloadFile(
        url: string,
        destPath: string,
        onProgress?: (downloaded: number, total: number) => void,
        token?: vscode.CancellationToken
    ): Promise<void> {
        const proxy = this.getProxyUrl();

        if (this.hasCurl()) {
            this.log(`使用 curl 下载`);
            return this.downloadWithCurl(url, destPath, proxy, onProgress, token);
        }

        this.log(`curl 不可用，使用内置下载`);
        return this.downloadWithNode(url, destPath, proxy, onProgress, token);
    }

    private downloadWithCurl(
        url: string,
        destPath: string,
        proxy: string | undefined,
        onProgress?: (downloaded: number, total: number) => void,
        token?: vscode.CancellationToken
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const args = [
                '-L', '-f',
                '--connect-timeout', '30',
                '--speed-limit', '1000',
                '--speed-time', '30',
                '--max-time', '1800',
                '-o', destPath, '-s',
            ];

            if (proxy) { args.push('--proxy', proxy); }
            args.push(url);

            this.log(`执行: curl ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

            const curlBin = process.platform === 'win32' ? 'curl.exe' : 'curl';
            const curlProcess = spawn(curlBin, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
                windowsHide: true
            });

            let progressTimer: NodeJS.Timeout | null = null;
            let lastLogSize = 0;
            let lastLogTime = Date.now();

            progressTimer = setInterval(() => {
                try {
                    if (fs.existsSync(destPath)) {
                        const size = fs.statSync(destPath).size;
                        onProgress?.(size, 0);
                        const now = Date.now();
                        if (now - lastLogTime >= 5000) {
                            const speed = ((size - lastLogSize) / 1024 / ((now - lastLogTime) / 1000)).toFixed(0);
                            this.log(`下载中: ${(size / 1024 / 1024).toFixed(1)} MB (${speed} KB/s)`);
                            lastLogSize = size;
                            lastLogTime = now;
                        }
                    }
                } catch {}
            }, 2000);

            const cleanup = () => {
                if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
            };

            const cancelDisposable = token?.onCancellationRequested(() => {
                this.log('用户取消下载');
                curlProcess.kill();
                cleanup();
                reject(new Error('已取消'));
            });

            let stderrData = '';
            curlProcess.stderr?.on('data', (data: Buffer) => { stderrData += data.toString(); });

            curlProcess.on('close', (code) => {
                cleanup();
                cancelDisposable?.dispose();
                if (code === 0) {
                    const fileSize = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
                    this.log(`curl 完成, 文件大小: ${(fileSize / 1024 / 1024).toFixed(1)} MB`);
                    resolve();
                } else {
                    let errMsg = `curl 退出码: ${code}`;
                    if (code === 28) { errMsg = '下载超时 (速度过慢或连接中断)'; }
                    if (code === 22) { errMsg = 'HTTP 错误 (文件不存在或服务器拒绝)'; }
                    if (code === 7) { errMsg = '无法连接服务器'; }
                    if (code === 56) { errMsg = '网络连接中断'; }
                    if (stderrData.trim()) { errMsg += ` - ${stderrData.trim().slice(-200)}`; }
                    this.log(`curl 失败: ${errMsg}`);
                    reject(new Error(errMsg));
                }
            });

            curlProcess.on('error', (err) => {
                cleanup();
                cancelDisposable?.dispose();
                reject(new Error(`curl 不可用: ${err.message}`));
            });
        });
    }

    private downloadWithNode(
        url: string,
        destPath: string,
        proxy: string | undefined,
        onProgress?: (downloaded: number, total: number) => void,
        token?: vscode.CancellationToken
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            let aborted = false;
            let dataTimer: NodeJS.Timeout | null = null;
            let lastLogSize = 0;
            let lastLogTime = Date.now();
            const DATA_TIMEOUT = 30000;

            const cancelDisposable = token?.onCancellationRequested(() => {
                aborted = true;
                if (dataTimer) { clearTimeout(dataTimer); }
                reject(new Error('已取消'));
            });

            const done = (err?: Error) => {
                if (dataTimer) { clearTimeout(dataTimer); }
                cancelDisposable?.dispose();
                if (err) { reject(err); } else { resolve(); }
            };

            const makeRequest = (targetUrl: string, redirects: number = 0) => {
                if (aborted) { return; }
                if (redirects > 10) { done(new Error('重定向次数过多')); return; }

                const target = new URL(targetUrl);

                if (proxy) {
                    this.connectViaProxy(proxy, target).then(
                        (socket) => this.doHttpsRequest(target, socket, destPath, onProgress, done, () => aborted, DATA_TIMEOUT, dataTimer, (t) => { dataTimer = t; }, lastLogSize, lastLogTime, (s) => { lastLogSize = s; }, (t) => { lastLogTime = t; }, redirects, makeRequest),
                        (err) => {
                            this.log(`代理连接失败: ${err.message}, 尝试直连`);
                            this.doDirectRequest(targetUrl, destPath, onProgress, done, () => aborted, DATA_TIMEOUT, dataTimer, (t) => { dataTimer = t; }, lastLogSize, lastLogTime, (s) => { lastLogSize = s; }, (t) => { lastLogTime = t; }, redirects, makeRequest);
                        }
                    );
                } else {
                    this.doDirectRequest(targetUrl, destPath, onProgress, done, () => aborted, DATA_TIMEOUT, dataTimer, (t) => { dataTimer = t; }, lastLogSize, lastLogTime, (s) => { lastLogSize = s; }, (t) => { lastLogTime = t; }, redirects, makeRequest);
                }
            };

            makeRequest(url);
        });
    }

    private connectViaProxy(proxyUrl: string, target: URL): Promise<import('net').Socket> {
        return new Promise((resolve, reject) => {
            const proxy = new URL(proxyUrl);
            const port = parseInt(proxy.port || '8080');
            const connectReq = http.request({
                host: proxy.hostname,
                port,
                method: 'CONNECT',
                path: `${target.hostname}:${target.port || 443}`,
                headers: proxy.username ? {
                    'Proxy-Authorization': 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`).toString('base64')
                } : {}
            });

            connectReq.on('connect', (res, socket) => {
                if (res.statusCode === 200) {
                    resolve(socket);
                } else {
                    reject(new Error(`代理 CONNECT 失败: ${res.statusCode}`));
                }
            });

            connectReq.on('error', reject);
            connectReq.setTimeout(10000, () => { connectReq.destroy(); reject(new Error('代理连接超时')); });
            connectReq.end();
        });
    }

    private doDirectRequest(
        url: string, destPath: string,
        onProgress: ((d: number, t: number) => void) | undefined,
        done: (err?: Error) => void,
        isAborted: () => boolean,
        dataTimeout: number,
        _dataTimer: NodeJS.Timeout | null,
        setDataTimer: (t: NodeJS.Timeout | null) => void,
        lastLogSize: number, lastLogTime: number,
        setLastLogSize: (s: number) => void, setLastLogTime: (t: number) => void,
        redirects: number,
        makeRequest: (url: string, r: number) => void
    ) {
        const parsed = new URL(url);
        const protocol = parsed.protocol === 'https:' ? https : http;
        const req = protocol.get(url, { timeout: 30000 }, (res) => {
            this.handleResponse(res, parsed, destPath, onProgress, done, isAborted,
                dataTimeout, setDataTimer, lastLogSize, lastLogTime, setLastLogSize, setLastLogTime,
                redirects, makeRequest);
        });
        req.on('error', (err) => { if (!isAborted()) { done(err); } });
        req.on('timeout', () => { req.destroy(); done(new Error('连接超时')); });
    }

    private doHttpsRequest(
        target: URL, socket: import('net').Socket, destPath: string,
        onProgress: ((d: number, t: number) => void) | undefined,
        done: (err?: Error) => void,
        isAborted: () => boolean,
        dataTimeout: number,
        _dataTimer: NodeJS.Timeout | null,
        setDataTimer: (t: NodeJS.Timeout | null) => void,
        lastLogSize: number, lastLogTime: number,
        setLastLogSize: (s: number) => void, setLastLogTime: (t: number) => void,
        redirects: number,
        makeRequest: (url: string, r: number) => void
    ) {
        const tlsSocket = tls.connect({ host: target.hostname, socket, servername: target.hostname }, () => {
            const reqOptions: https.RequestOptions = {
                host: target.hostname,
                path: target.pathname + target.search,
                method: 'GET',
                createConnection: () => tlsSocket,
                agent: false as unknown as https.Agent
            };
            const req = https.request(reqOptions, (res) => {
                this.handleResponse(res, target, destPath, onProgress, done, isAborted,
                    dataTimeout, setDataTimer, lastLogSize, lastLogTime, setLastLogSize, setLastLogTime,
                    redirects, makeRequest);
            });
            req.on('error', (err) => { if (!isAborted()) { done(err); } });
            req.end();
        });
        tlsSocket.on('error', (err) => { if (!isAborted()) { done(err); } });
    }

    private handleResponse(
        res: http.IncomingMessage, parsedUrl: URL, destPath: string,
        onProgress: ((d: number, t: number) => void) | undefined,
        done: (err?: Error) => void,
        isAborted: () => boolean,
        dataTimeout: number,
        setDataTimer: (t: NodeJS.Timeout | null) => void,
        lastLogSize: number, lastLogTime: number,
        setLastLogSize: (s: number) => void, setLastLogTime: (t: number) => void,
        redirects: number,
        makeRequest: (url: string, r: number) => void
    ) {
        const statusCode = res.statusCode || 0;

        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
            let redirectUrl = res.headers.location;
            if (!redirectUrl.startsWith('http')) {
                redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
            }
            this.log(`重定向: ${redirectUrl}`);
            res.resume();
            makeRequest(redirectUrl, redirects + 1);
            return;
        }

        if (statusCode !== 200) {
            done(new Error(`HTTP ${statusCode}`));
            return;
        }

        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        let downloaded = 0;
        const fileStream = fs.createWriteStream(destPath);

        const resetDataTimer = () => {
            setDataTimer(null);
            const timer = setTimeout(() => {
                this.log('下载超时: 30秒无数据');
                res.destroy();
                fileStream.close();
                done(new Error('下载超时: 30秒无数据接收'));
            }, dataTimeout);
            setDataTimer(timer);
        };

        resetDataTimer();

        res.on('data', (chunk: Buffer) => {
            if (isAborted()) { return; }
            downloaded += chunk.length;
            resetDataTimer();
            onProgress?.(downloaded, totalSize);

            const now = Date.now();
            if (now - lastLogTime >= 5000) {
                const speed = ((downloaded - lastLogSize) / 1024 / ((now - lastLogTime) / 1000)).toFixed(0);
                const totalStr = totalSize > 0 ? `/${(totalSize / 1024 / 1024).toFixed(1)}` : '';
                this.log(`下载中: ${(downloaded / 1024 / 1024).toFixed(1)}${totalStr} MB (${speed} KB/s)`);
                setLastLogSize(downloaded);
                setLastLogTime(now);
            }
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
            fileStream.close();
            this.log(`下载完成: ${(downloaded / 1024 / 1024).toFixed(1)} MB`);
            done();
        });

        fileStream.on('error', (err) => {
            fs.unlink(destPath, () => {});
            done(err);
        });
    }

    private async extractArchive(archivePath: string, destDir: string): Promise<void> {
        this.log(`解压: ${path.basename(archivePath)} -> ${destDir}`);
        if (archivePath.endsWith('.zip')) {
            if (process.platform === 'win32') {
                try {
                    execSync(
                        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force"`,
                        { timeout: 600000 }
                    );
                } catch {
                    this.log('Expand-Archive 失败，尝试 tar...');
                    execSync(`tar xf "${archivePath}" -C "${destDir}"`, { timeout: 600000 });
                }
            } else {
                execSync(`unzip -o "${archivePath}" -d "${destDir}"`, { timeout: 600000 });
            }
        } else {
            execSync(`tar xf "${archivePath}" -C "${destDir}"`, { timeout: 600000 });
        }
    }

    private flattenDirectory(dir: string): void {
        try {
            const entries = fs.readdirSync(dir);
            if (entries.length === 1) {
                const subPath = path.join(dir, entries[0]);
                if (fs.statSync(subPath).isDirectory()) {
                    this.log(`整理目录: ${entries[0]}/`);
                    const subEntries = fs.readdirSync(subPath);
                    for (const entry of subEntries) {
                        fs.renameSync(path.join(subPath, entry), path.join(dir, entry));
                    }
                    fs.rmdirSync(subPath);
                }
            }
        } catch (err) {
            this.log(`目录整理失败: ${err}`);
        }
    }

    private getInstalledPaths(tool: ToolName): DetectedTools {
        const toolDir = path.join(this.toolsDir, tool);
        const ext = process.platform === 'win32' ? '.exe' : '';

        switch (tool) {
            case 'gcc-arm': {
                const binDir = path.join(toolDir, 'bin');
                if (fs.existsSync(path.join(binDir, `arm-none-eabi-gcc${ext}`))) {
                    return { gccPath: binDir };
                }
                return {};
            }
            case 'cmake': {
                let cmake = path.join(toolDir, 'bin', `cmake${ext}`);
                if (fs.existsSync(cmake)) { return { cmakePath: cmake }; }
                cmake = path.join(toolDir, 'CMake.app', 'Contents', 'bin', 'cmake');
                if (fs.existsSync(cmake)) { return { cmakePath: cmake }; }
                return {};
            }
            case 'ninja': {
                const ninja = path.join(toolDir, `ninja${ext}`);
                if (fs.existsSync(ninja)) { return { ninjaPath: ninja }; }
                return {};
            }
            case 'openocd': {
                const openocd = path.join(toolDir, 'bin', `openocd${ext}`);
                if (fs.existsSync(openocd)) {
                    const scriptsPath = this.findOpenOCDScripts(toolDir);
                    return { openocdPath: openocd, openocdScriptsPath: scriptsPath };
                }
                return {};
            }
        }
    }

    private findOpenOCDScripts(baseDir: string): string {
        const candidates = [
            path.join(baseDir, 'share', 'openocd', 'scripts'),
            path.join(baseDir, 'scripts'),
            path.join(baseDir, 'openocd', 'scripts'),
            path.join(baseDir, 'distro-info', 'scripts'),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) { return p; }
        }
        const found = this.findDirRecursive(baseDir, 'scripts', 4);
        if (found && fs.existsSync(path.join(found, 'target'))) { return found; }
        return '';
    }

    private findDirRecursive(dir: string, name: string, maxDepth: number): string | null {
        if (maxDepth <= 0) { return null; }
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (entry.name === name) { return path.join(dir, entry.name); }
                    const found = this.findDirRecursive(path.join(dir, entry.name), name, maxDepth - 1);
                    if (found) { return found; }
                }
            }
        } catch {}
        return null;
    }

    private getArchiveExtension(url: string): string {
        if (url.endsWith('.tar.xz')) { return '.tar.xz'; }
        if (url.endsWith('.tar.gz')) { return '.tar.gz'; }
        return '.zip';
    }

    isToolInstalled(tool: ToolName): boolean {
        const paths = this.getInstalledPaths(tool);
        return Object.values(paths).some(v => !!v);
    }
}
