import * as vscode from 'vscode';

export interface STM32Chip {
    name: string;
    family: string;
    core: string;
    flashSize: string;
    ramSize: string;
    openocdTarget: string;
    svdFile?: string;
}

// STM32 芯片数据库
const STM32_CHIPS: STM32Chip[] = [
    // STM32F0 系列
    { name: 'STM32F030F4', family: 'STM32F0', core: 'Cortex-M0', flashSize: '16KB', ramSize: '4KB', openocdTarget: 'stm32f0x' },
    { name: 'STM32F030C8', family: 'STM32F0', core: 'Cortex-M0', flashSize: '64KB', ramSize: '8KB', openocdTarget: 'stm32f0x' },
    { name: 'STM32F051C8', family: 'STM32F0', core: 'Cortex-M0', flashSize: '64KB', ramSize: '8KB', openocdTarget: 'stm32f0x' },
    { name: 'STM32F072RB', family: 'STM32F0', core: 'Cortex-M0', flashSize: '128KB', ramSize: '16KB', openocdTarget: 'stm32f0x' },
    
    // STM32F1 系列
    { name: 'STM32F103C6', family: 'STM32F1', core: 'Cortex-M3', flashSize: '32KB', ramSize: '10KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103C8', family: 'STM32F1', core: 'Cortex-M3', flashSize: '64KB', ramSize: '20KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103CB', family: 'STM32F1', core: 'Cortex-M3', flashSize: '128KB', ramSize: '20KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103RB', family: 'STM32F1', core: 'Cortex-M3', flashSize: '128KB', ramSize: '20KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103RC', family: 'STM32F1', core: 'Cortex-M3', flashSize: '256KB', ramSize: '48KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103RE', family: 'STM32F1', core: 'Cortex-M3', flashSize: '512KB', ramSize: '64KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103VE', family: 'STM32F1', core: 'Cortex-M3', flashSize: '512KB', ramSize: '64KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F103ZE', family: 'STM32F1', core: 'Cortex-M3', flashSize: '512KB', ramSize: '64KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F105RC', family: 'STM32F1', core: 'Cortex-M3', flashSize: '256KB', ramSize: '64KB', openocdTarget: 'stm32f1x' },
    { name: 'STM32F107RC', family: 'STM32F1', core: 'Cortex-M3', flashSize: '256KB', ramSize: '64KB', openocdTarget: 'stm32f1x' },
    
    // STM32F2 系列
    { name: 'STM32F205RB', family: 'STM32F2', core: 'Cortex-M3', flashSize: '128KB', ramSize: '64KB', openocdTarget: 'stm32f2x' },
    { name: 'STM32F205RE', family: 'STM32F2', core: 'Cortex-M3', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32f2x' },
    { name: 'STM32F207VE', family: 'STM32F2', core: 'Cortex-M3', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32f2x' },
    
    // STM32F3 系列
    { name: 'STM32F301C8', family: 'STM32F3', core: 'Cortex-M4', flashSize: '64KB', ramSize: '16KB', openocdTarget: 'stm32f3x' },
    { name: 'STM32F303CB', family: 'STM32F3', core: 'Cortex-M4', flashSize: '128KB', ramSize: '32KB', openocdTarget: 'stm32f3x' },
    { name: 'STM32F303RE', family: 'STM32F3', core: 'Cortex-M4', flashSize: '512KB', ramSize: '80KB', openocdTarget: 'stm32f3x' },
    { name: 'STM32F303VE', family: 'STM32F3', core: 'Cortex-M4', flashSize: '512KB', ramSize: '80KB', openocdTarget: 'stm32f3x' },
    
    // STM32F4 系列
    { name: 'STM32F401CB', family: 'STM32F4', core: 'Cortex-M4', flashSize: '128KB', ramSize: '64KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F401CC', family: 'STM32F4', core: 'Cortex-M4', flashSize: '256KB', ramSize: '64KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F401RE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '96KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F405RG', family: 'STM32F4', core: 'Cortex-M4', flashSize: '1MB', ramSize: '192KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F407VE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '192KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F407VG', family: 'STM32F4', core: 'Cortex-M4', flashSize: '1MB', ramSize: '192KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F407ZE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '192KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F407ZG', family: 'STM32F4', core: 'Cortex-M4', flashSize: '1MB', ramSize: '192KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F411CE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F411RE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F429ZI', family: 'STM32F4', core: 'Cortex-M4', flashSize: '2MB', ramSize: '256KB', openocdTarget: 'stm32f4x' },
    { name: 'STM32F446RE', family: 'STM32F4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32f4x' },
    
    // STM32F7 系列
    { name: 'STM32F722RE', family: 'STM32F7', core: 'Cortex-M7', flashSize: '512KB', ramSize: '256KB', openocdTarget: 'stm32f7x' },
    { name: 'STM32F746ZG', family: 'STM32F7', core: 'Cortex-M7', flashSize: '1MB', ramSize: '320KB', openocdTarget: 'stm32f7x' },
    { name: 'STM32F767ZI', family: 'STM32F7', core: 'Cortex-M7', flashSize: '2MB', ramSize: '512KB', openocdTarget: 'stm32f7x' },
    
    // STM32G0 系列
    { name: 'STM32G030F6', family: 'STM32G0', core: 'Cortex-M0+', flashSize: '32KB', ramSize: '8KB', openocdTarget: 'stm32g0x' },
    { name: 'STM32G030K8', family: 'STM32G0', core: 'Cortex-M0+', flashSize: '64KB', ramSize: '8KB', openocdTarget: 'stm32g0x' },
    { name: 'STM32G071RB', family: 'STM32G0', core: 'Cortex-M0+', flashSize: '128KB', ramSize: '36KB', openocdTarget: 'stm32g0x' },
    
    // STM32G4 系列
    { name: 'STM32G431KB', family: 'STM32G4', core: 'Cortex-M4', flashSize: '128KB', ramSize: '32KB', openocdTarget: 'stm32g4x' },
    { name: 'STM32G431RB', family: 'STM32G4', core: 'Cortex-M4', flashSize: '128KB', ramSize: '32KB', openocdTarget: 'stm32g4x' },
    { name: 'STM32G474RE', family: 'STM32G4', core: 'Cortex-M4', flashSize: '512KB', ramSize: '128KB', openocdTarget: 'stm32g4x' },
    
    // STM32H7 系列
    { name: 'STM32H743VI', family: 'STM32H7', core: 'Cortex-M7', flashSize: '2MB', ramSize: '1MB', openocdTarget: 'stm32h7x' },
    { name: 'STM32H743ZI', family: 'STM32H7', core: 'Cortex-M7', flashSize: '2MB', ramSize: '1MB', openocdTarget: 'stm32h7x' },
    { name: 'STM32H750VB', family: 'STM32H7', core: 'Cortex-M7', flashSize: '128KB', ramSize: '1MB', openocdTarget: 'stm32h7x' },
    
    // STM32L0 系列
    { name: 'STM32L011F4', family: 'STM32L0', core: 'Cortex-M0+', flashSize: '16KB', ramSize: '2KB', openocdTarget: 'stm32l0' },
    { name: 'STM32L031K6', family: 'STM32L0', core: 'Cortex-M0+', flashSize: '32KB', ramSize: '8KB', openocdTarget: 'stm32l0' },
    { name: 'STM32L053R8', family: 'STM32L0', core: 'Cortex-M0+', flashSize: '64KB', ramSize: '8KB', openocdTarget: 'stm32l0' },
    
    // STM32L1 系列
    { name: 'STM32L151C8', family: 'STM32L1', core: 'Cortex-M3', flashSize: '64KB', ramSize: '32KB', openocdTarget: 'stm32l1' },
    { name: 'STM32L152RE', family: 'STM32L1', core: 'Cortex-M3', flashSize: '512KB', ramSize: '80KB', openocdTarget: 'stm32l1' },
    
    // STM32L4 系列
    { name: 'STM32L431RC', family: 'STM32L4', core: 'Cortex-M4', flashSize: '256KB', ramSize: '64KB', openocdTarget: 'stm32l4x' },
    { name: 'STM32L432KC', family: 'STM32L4', core: 'Cortex-M4', flashSize: '256KB', ramSize: '64KB', openocdTarget: 'stm32l4x' },
    { name: 'STM32L476RG', family: 'STM32L4', core: 'Cortex-M4', flashSize: '1MB', ramSize: '128KB', openocdTarget: 'stm32l4x' },
    { name: 'STM32L496ZG', family: 'STM32L4', core: 'Cortex-M4', flashSize: '1MB', ramSize: '320KB', openocdTarget: 'stm32l4x' },
    
    // STM32L5 系列
    { name: 'STM32L552ZE', family: 'STM32L5', core: 'Cortex-M33', flashSize: '512KB', ramSize: '256KB', openocdTarget: 'stm32l5x' },
    
    // STM32U5 系列
    { name: 'STM32U575ZI', family: 'STM32U5', core: 'Cortex-M33', flashSize: '2MB', ramSize: '786KB', openocdTarget: 'stm32u5x' },
    
    // STM32WB 系列
    { name: 'STM32WB55RG', family: 'STM32WB', core: 'Cortex-M4', flashSize: '1MB', ramSize: '256KB', openocdTarget: 'stm32wbx' },
];

export class STM32ChipSelector {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    async selectChip(): Promise<STM32Chip | undefined> {
        // 先选择系列
        const families = [...new Set(STM32_CHIPS.map(c => c.family))].sort();
        
        const selectedFamily = await vscode.window.showQuickPick(families, {
            placeHolder: '选择 STM32 系列',
            title: 'STM32 芯片选择'
        });

        if (!selectedFamily) {
            return undefined;
        }

        // 再选择具体型号
        const chipsInFamily = STM32_CHIPS.filter(c => c.family === selectedFamily);
        const chipItems = chipsInFamily.map(chip => ({
            label: chip.name,
            description: `${chip.core} | Flash: ${chip.flashSize} | RAM: ${chip.ramSize}`,
            chip: chip
        }));

        const selectedItem = await vscode.window.showQuickPick(chipItems, {
            placeHolder: '选择具体型号',
            title: `${selectedFamily} 系列芯片`
        });

        if (!selectedItem) {
            return undefined;
        }

        // 保存选择
        const config = vscode.workspace.getConfiguration('stm32');
        await config.update('selectedChip', selectedItem.chip.name, vscode.ConfigurationTarget.Workspace);
        
        // 保存芯片详细信息到工作区状态
        this.context.workspaceState.update('stm32.chipInfo', selectedItem.chip);

        return selectedItem.chip;
    }

    getChipByName(name: string): STM32Chip | undefined {
        return STM32_CHIPS.find(c => c.name === name);
    }

    getCurrentChip(): STM32Chip | undefined {
        const config = vscode.workspace.getConfiguration('stm32');
        const chipName = config.get<string>('selectedChip');
        if (chipName) {
            return this.getChipByName(chipName);
        }
        return undefined;
    }

    getAllChips(): STM32Chip[] {
        return STM32_CHIPS;
    }

    getChipFamilies(): string[] {
        return [...new Set(STM32_CHIPS.map(c => c.family))].sort();
    }
}

