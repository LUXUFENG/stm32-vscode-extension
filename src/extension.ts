import * as vscode from 'vscode';
import { STM32ProjectProvider } from './providers/projectProvider';
import { CMakeBuilder } from './utils/cmakeBuilder';
import { OpenOCDManager } from './utils/openocdManager';
import { STM32ChipSelector } from './utils/chipSelector';
import { DebugConfigGenerator } from './utils/debugConfigGenerator';
import { ToolchainDetector } from './utils/toolchainDetector';
import { ProjectDetector, selectDebugInterface, selectBuildType } from './utils/projectDetector';
import { SerialMonitor } from './utils/serialMonitor';

let openocdManager: OpenOCDManager | undefined;
let serialMonitor: SerialMonitor | undefined;
let outputChannel: vscode.OutputChannel;
let toolchainDetector: ToolchainDetector;
let projectDetector: ProjectDetector;

// 状态栏项目
let statusBarChip: vscode.StatusBarItem;
let statusBarDebugger: vscode.StatusBarItem;
let statusBarBuildType: vscode.StatusBarItem;
let statusBarBuild: vscode.StatusBarItem;
let statusBarClean: vscode.StatusBarItem;
let statusBarFlash: vscode.StatusBarItem;
let statusBarDebug: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    console.log('STM32 Development Tools 扩展已激活');
    
    // 创建输出通道
    outputChannel = vscode.window.createOutputChannel('STM32 Development');
    context.subscriptions.push(outputChannel);
    
    // 初始化管理器
    const cmakeBuilder = new CMakeBuilder(outputChannel);
    openocdManager = new OpenOCDManager(outputChannel);
    const chipSelector = new STM32ChipSelector(context);
    const debugConfigGen = new DebugConfigGenerator();
    toolchainDetector = new ToolchainDetector(outputChannel);
    projectDetector = new ProjectDetector();
    serialMonitor = new SerialMonitor();
    context.subscriptions.push(serialMonitor.getStatusBarItem());
    
    // 初始化视图提供器
    const projectProvider = new STM32ProjectProvider();
    
    // 注册视图
    vscode.window.registerTreeDataProvider('stm32-project', projectProvider);
    
    // 注册命令: 选择芯片
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.selectChip', async () => {
            const chip = await chipSelector.selectChip();
            if (chip) {
                outputChannel.appendLine(`已选择芯片: ${chip.name}`);
                projectProvider.refresh();
            }
        })
    );
    
    // 注册命令: 编译项目
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.build', async () => {
            outputChannel.show();
            outputChannel.appendLine('开始编译项目...');
            try {
                await cmakeBuilder.build();
                vscode.window.showInformationMessage('STM32: 编译成功!');
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 编译失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 清理项目
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.clean', async () => {
            outputChannel.show();
            outputChannel.appendLine('清理项目...');
            try {
                await cmakeBuilder.clean();
                vscode.window.showInformationMessage('STM32: 清理完成!');
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 清理失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 重新编译
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.rebuild', async () => {
            outputChannel.show();
            outputChannel.appendLine('重新编译项目...');
            try {
                await cmakeBuilder.rebuild();
                vscode.window.showInformationMessage('STM32: 重新编译成功!');
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 重新编译失败 - ${error}`);
            }
        })
    );

    // 注册命令: 生成 BIN/HEX 文件
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.generateBin', async () => {
            outputChannel.show();
            try {
                const result = await cmakeBuilder.generateBinHex();
                vscode.window.showInformationMessage(`STM32: 已生成 BIN 和 HEX 文件`);
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 生成失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 下载程序
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.flash', async () => {
            outputChannel.show();
            outputChannel.appendLine('下载程序到芯片...');
            try {
                await openocdManager!.flash();
                vscode.window.showInformationMessage('STM32: 程序下载成功!');
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 程序下载失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 开始调试 (使用 Cortex-Debug)
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.debug', async () => {
            try {
                // 检查 Cortex-Debug 是否安装
                const cortexDebug = vscode.extensions.getExtension('marus25.cortex-debug');
                if (!cortexDebug) {
                    const install = await vscode.window.showErrorMessage(
                        'STM32: 需要安装 Cortex-Debug 扩展才能调试',
                        '安装 Cortex-Debug'
                    );
                    if (install) {
                        await vscode.commands.executeCommand('workbench.extensions.installExtension', 'marus25.cortex-debug');
                    }
                    return;
                }

                // 先编译项目
                outputChannel.show();
                outputChannel.appendLine('编译项目...');
                const cmakeTools = vscode.extensions.getExtension('ms-vscode.cmake-tools');
                if (cmakeTools) {
                    await vscode.commands.executeCommand('cmake.build');
                } else {
                    await cmakeBuilder.build();
                }

                // 生成/更新 launch.json 并启动调试
                outputChannel.appendLine('更新调试配置...');
                await debugConfigGen.generateAndStartDebug();
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 启动调试失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 启动 OpenOCD
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.openocdStart', async () => {
            outputChannel.show();
            try {
                await openocdManager!.start();
                vscode.window.showInformationMessage('STM32: OpenOCD 服务已启动');
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: OpenOCD 启动失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 停止 OpenOCD
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.openocdStop', async () => {
            openocdManager!.stop();
            vscode.window.showInformationMessage('STM32: OpenOCD 服务已停止');
        })
    );
    
    // 注册命令: 生成调试配置
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.generateLaunchConfig', async () => {
            try {
                await debugConfigGen.generateLaunchJson();
                vscode.window.showInformationMessage('STM32: 调试配置已生成');
            } catch (error) {
                vscode.window.showErrorMessage(`STM32: 生成配置失败 - ${error}`);
            }
        })
    );
    
    // 注册命令: 自动检测工具链
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.detectToolchain', async () => {
            outputChannel.show();
            await toolchainDetector.showDetectionResultsAndApply();
            projectProvider.refresh();
        })
    );

    // 注册命令: 快速自动检测（静默模式）
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.autoDetectToolchain', async () => {
            const tools = await toolchainDetector.detectAll();
            if (tools.gccPath || tools.openocdPath) {
                await toolchainDetector.applyDetectedTools(tools);
                outputChannel.appendLine('工具链已自动配置');
                projectProvider.refresh();
            }
        })
    );

    // 注册命令: 选择调试器
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.selectDebugger', async () => {
            const debugger_ = await selectDebugInterface();
            if (debugger_) {
                outputChannel.appendLine(`已选择调试器: ${debugger_}`);
                updateAllStatusBars();
                projectProvider.refresh();
            }
        })
    );

    // 注册命令: 选择构建类型
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.selectBuildType', async () => {
            const buildType = await selectBuildType();
            if (buildType) {
                outputChannel.appendLine(`已选择构建类型: ${buildType}`);
                updateAllStatusBars();
                projectProvider.refresh();
            }
        })
    );

    // 注册命令: 自动检测芯片
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.autoDetectChip', async () => {
            outputChannel.show();
            outputChannel.appendLine('正在检测项目芯片型号...');
            const info = await projectDetector.detectChip();
            if (info.chipName) {
                const config = vscode.workspace.getConfiguration('stm32');
                await config.update('selectedChip', info.chipName, vscode.ConfigurationTarget.Workspace);
                outputChannel.appendLine(`检测到芯片: ${info.chipName} (${info.chipFamily})`);
                vscode.window.showInformationMessage(`STM32: 检测到芯片 ${info.chipName}`);
                updateAllStatusBars();
                projectProvider.refresh();
            } else {
                outputChannel.appendLine('未能自动检测芯片型号');
                vscode.window.showWarningMessage('STM32: 未能自动检测芯片型号，请手动选择');
            }
        })
    );

    // ============ 串口监视器命令 ============
    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.serial.toggle', async () => {
            await serialMonitor!.toggle();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.serial.connect', async () => {
            await serialMonitor!.connect();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.serial.disconnect', async () => {
            await serialMonitor!.disconnect();
            vscode.window.showInformationMessage('串口已断开');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.serial.send', async () => {
            await serialMonitor!.send();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('stm32.serial.show', () => {
            serialMonitor!.show();
        })
    );

    // 首次启动时检查是否需要自动检测工具链和芯片
    checkAndAutoDetectToolchain(context);
    autoDetectChipOnStartup();
    
    // ============ 状态栏配置项 ============
    // 状态栏项目 - 芯片
    statusBarChip = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 103);
    statusBarChip.command = 'stm32.selectChip';
    statusBarChip.tooltip = '点击选择 STM32 芯片型号';
    statusBarChip.show();
    context.subscriptions.push(statusBarChip);

    // 状态栏项目 - 调试器
    statusBarDebugger = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 102);
    statusBarDebugger.command = 'stm32.selectDebugger';
    statusBarDebugger.tooltip = '点击选择调试器类型';
    statusBarDebugger.show();
    context.subscriptions.push(statusBarDebugger);

    // 状态栏项目 - 构建类型
    statusBarBuildType = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 101);
    statusBarBuildType.command = 'stm32.selectBuildType';
    statusBarBuildType.tooltip = '点击选择构建类型';
    statusBarBuildType.show();
    context.subscriptions.push(statusBarBuildType);

    // ============ 状态栏操作按钮 ============
    // 编译按钮
    statusBarBuild = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
    statusBarBuild.text = '$(tools) 编译';
    statusBarBuild.command = 'stm32.build';
    statusBarBuild.tooltip = '编译项目 (CMake)';
    statusBarBuild.show();
    context.subscriptions.push(statusBarBuild);

    // 清理按钮
    statusBarClean = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 97);
    statusBarClean.text = '$(trash) 清理';
    statusBarClean.command = 'stm32.clean';
    statusBarClean.tooltip = '清理构建目录';
    statusBarClean.show();
    context.subscriptions.push(statusBarClean);

    // 烧录按钮
    statusBarFlash = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 96);
    statusBarFlash.text = '$(arrow-down) 烧录';
    statusBarFlash.command = 'stm32.flash';
    statusBarFlash.tooltip = '下载程序到芯片 (OpenOCD)';
    statusBarFlash.show();
    context.subscriptions.push(statusBarFlash);

    // 调试按钮
    statusBarDebug = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 95);
    statusBarDebug.text = '$(debug-alt) 调试';
    statusBarDebug.command = 'stm32.debug';
    statusBarDebug.tooltip = '开始调试 (Cortex-Debug)';
    statusBarDebug.show();
    context.subscriptions.push(statusBarDebug);

    // 初始化状态栏
    updateAllStatusBars();
    
    // 监听配置变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('stm32')) {
                updateAllStatusBars();
                projectProvider.refresh();
            }
        })
    );
    
    outputChannel.appendLine('STM32 Development Tools 已就绪');
}

function updateAllStatusBars() {
    const config = vscode.workspace.getConfiguration('stm32');
    
    // 芯片
    const chip = config.get<string>('selectedChip');
    if (chip) {
        statusBarChip.text = `$(circuit-board) ${chip}`;
    } else {
        statusBarChip.text = '$(circuit-board) 选择芯片';
    }

    // 调试器
    const debugInterface = config.get<string>('debugInterface') || 'stlink';
    const debuggerNames: Record<string, string> = {
        'stlink': 'ST-Link',
        'stlink-v2': 'ST-Link V2',
        'stlink-v2-1': 'ST-Link V2-1',
        'stlink-v3': 'ST-Link V3',
        'jlink': 'J-Link',
        'cmsis-dap': 'CMSIS-DAP'
    };
    statusBarDebugger.text = `$(plug) ${debuggerNames[debugInterface] || debugInterface}`;

    // 构建类型
    const buildType = config.get<string>('buildType') || 'Debug';
    const buildIcon = buildType === 'Debug' ? '$(bug)' : '$(package)';
    statusBarBuildType.text = `${buildIcon} ${buildType}`;
}

/**
 * 启动时自动检测芯片
 */
async function autoDetectChipOnStartup() {
    const config = vscode.workspace.getConfiguration('stm32');
    const currentChip = config.get<string>('selectedChip');
    
    // 尝试从项目文件检测芯片
    const detectedInfo = await projectDetector.detectChip();
    
    if (!detectedInfo.chipName) {
        // 无法自动检测
        if (!currentChip) {
            outputChannel.appendLine('未能自动检测芯片型号，请手动选择');
        }
        return;
    }

    const detectedChip = detectedInfo.chipName;

    if (!currentChip) {
        // 芯片未配置，直接使用检测到的
        await config.update('selectedChip', detectedChip, vscode.ConfigurationTarget.Workspace);
        outputChannel.appendLine(`自动检测到芯片: ${detectedChip} (来源: 项目文件)`);
        updateAllStatusBars();
    } else if (currentChip.toUpperCase() !== detectedChip.toUpperCase()) {
        // 检测到的芯片与当前配置不同，提示用户
        outputChannel.appendLine(`芯片配置冲突: 当前配置 ${currentChip}, 项目检测 ${detectedChip}`);
        
        const choice = await vscode.window.showWarningMessage(
            `STM32: 检测到芯片型号不一致\n当前配置: ${currentChip}\n项目检测: ${detectedChip}`,
            { modal: false },
            `使用检测到的 (${detectedChip})`,
            `保留当前配置 (${currentChip})`,
            '手动选择'
        );

        if (choice?.startsWith('使用检测到的')) {
            await config.update('selectedChip', detectedChip, vscode.ConfigurationTarget.Workspace);
            outputChannel.appendLine(`已更新芯片配置为: ${detectedChip}`);
            updateAllStatusBars();
        } else if (choice === '手动选择') {
            await vscode.commands.executeCommand('stm32.selectChip');
        }
        // 保留当前配置则不做任何操作
    } else {
        // 配置一致
        outputChannel.appendLine(`芯片配置验证通过: ${currentChip}`);
    }
}

/**
 * 检查是否需要自动检测工具链
 */
async function checkAndAutoDetectToolchain(context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration('stm32');
    const toolchainPath = config.get<string>('toolchainPath');
    const openocdPath = config.get<string>('openocdPath');
    
    // 如果工具链路径未配置，询问是否自动检测
    if (!toolchainPath && !openocdPath) {
        const hasPrompted = context.globalState.get<boolean>('stm32.toolchainPrompted');
        
        if (!hasPrompted) {
            const choice = await vscode.window.showInformationMessage(
                'STM32: 检测到工具链未配置，是否自动查找本地安装的工具？',
                '自动查找',
                '手动配置',
                '不再提示'
            );

            if (choice === '自动查找') {
                outputChannel.show();
                await toolchainDetector.showDetectionResultsAndApply();
            } else if (choice === '手动配置') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'stm32');
            } else if (choice === '不再提示') {
                await context.globalState.update('stm32.toolchainPrompted', true);
            }
        }
    }
}

export function deactivate() {
    if (openocdManager) {
        openocdManager.stop();
    }
}

