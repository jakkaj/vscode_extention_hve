import * as vscode from 'vscode';
import * as jsonc from 'jsonc-parser';
import * as path from 'path';
import * as fs from 'fs';

// Interface for configuration data sent from the webview
interface ConfigData {
    networkMode: string;
    customNetwork?: string;
    enableGpu: boolean;
    gpuMode: 'all' | 'count' | 'devices';
    gpuCount: number;
    gpuDevices: string;
    setCudaEnv: boolean;
}

export class DevContainerViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'devcontainerEditor.view';
    private _view?: vscode.WebviewView;
    private _devContainerUri?: vscode.Uri;

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {
        // Register listener for document changes to update the UI when devcontainer.json is edited
        vscode.workspace.onDidChangeTextDocument(e => {
            if (this._devContainerUri && e.document.uri.fsPath === this._devContainerUri.fsPath) {
                this._updateWebviewFromFile();
            }
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        // Allow scripts in the webview
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        // Set the webview's initial HTML content
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'init':
                    // When the webview is loaded, load the current configuration
                    await this._loadDevcontainerJson();
                    break;
                case 'applyConfig':
                    // Apply configuration changes
                    await this._updateDevcontainerConfig(message.config);
                    break;
                case 'createDevcontainer':
                    // Create a new devcontainer.json file if it doesn't exist
                    await this._createDevcontainerJson();
                    break;
                case 'rebuildContainer':
                    // Trigger a container rebuild
                    vscode.commands.executeCommand('devcontainerEditor.rebuild');
                    break;
            }
        });

        // Initial load of devcontainer.json if it exists
        this._loadDevcontainerJson();
    }

    private async _loadDevcontainerJson(): Promise<void> {
        try {
            this._devContainerUri = await this._findDevcontainerUri();

            if (!this._devContainerUri) {
                // No devcontainer.json found, notify the webview
                this._view?.webview.postMessage({
                    command: 'noDevcontainer'
                });
                return;
            }

            // Read and parse the file
            const document = await vscode.workspace.openTextDocument(this._devContainerUri);
            const content = document.getText();
            const jsonObj = jsonc.parse(content);

            // Extract network mode
            let networkMode = 'default';
            let customNetwork = '';

            if (jsonObj.runArgs) {
                const networkIndex = jsonObj.runArgs.indexOf('--network');
                if (networkIndex !== -1 && networkIndex < jsonObj.runArgs.length - 1) {
                    const netMode = jsonObj.runArgs[networkIndex + 1];
                    if (netMode === 'host' || netMode === 'none') {
                        networkMode = netMode;
                    } else {
                        networkMode = 'custom';
                        customNetwork = netMode;
                    }
                }
            }

            // Extract GPU configuration
            let enableGpu = false;
            let gpuMode: 'all' | 'count' | 'devices' = 'all';
            let gpuCount = 1;
            let gpuDevices = '';
            let setCudaEnv = false;

            if (jsonObj.runArgs) {
                const gpusIndex = jsonObj.runArgs.indexOf('--gpus');
                if (gpusIndex !== -1 && gpusIndex < jsonObj.runArgs.length - 1) {
                    enableGpu = true;
                    const gpuValue = jsonObj.runArgs[gpusIndex + 1];

                    if (gpuValue === 'all') {
                        gpuMode = 'all';
                    } else if (gpuValue.startsWith('device=')) {
                        gpuMode = 'devices';
                        // Extract the devices part without the quotes
                        gpuDevices = gpuValue.replace(/^"?device=([^"]*)"?$/, '$1');
                    } else if (!isNaN(Number(gpuValue))) {
                        gpuMode = 'count';
                        gpuCount = Number(gpuValue);
                    }
                }
            }

            // Check for CUDA environment variables
            if (jsonObj.remoteEnv &&
                (jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES || jsonObj.remoteEnv.NVIDIA_VISIBLE_DEVICES)) {
                setCudaEnv = true;
            }

            // Send the current configuration to the webview
            this._view?.webview.postMessage({
                command: 'loadConfig',
                config: {
                    networkMode,
                    customNetwork,
                    enableGpu,
                    gpuMode,
                    gpuCount,
                    gpuDevices,
                    setCudaEnv
                }
            });
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to load devcontainer.json: ${err}`);
        }
    }

    private async _updateDevcontainerConfig(newConfig: ConfigData): Promise<void> {
        try {
            const devUri = await this._findDevcontainerUri();
            if (!devUri) {
                vscode.window.showErrorMessage("devcontainer.json not found. Create one first.");
                return;
            }

            const document = await vscode.workspace.openTextDocument(devUri);
            let jsonObj: any = jsonc.parse(document.getText());

            // Ensure runArgs exists
            if (!jsonObj.runArgs) {
                jsonObj.runArgs = [];
            }

            // Update network mode
            // Remove any existing network args
            jsonObj.runArgs = jsonObj.runArgs.filter((arg: string, i: number, arr: string[]) => {
                return !(arg === "--network" || (i > 0 && arr[i - 1] === "--network"));
            });

            // Add new network args if not default
            if (newConfig.networkMode !== 'default') {
                const netArg = newConfig.networkMode === 'custom' ? newConfig.customNetwork : newConfig.networkMode;
                jsonObj.runArgs.push("--network", netArg);
            }

            // Update GPU configuration
            // Remove existing GPU args
            jsonObj.runArgs = jsonObj.runArgs.filter((arg: string, i: number, arr: string[]) => {
                return !(arg === "--gpus" || (i > 0 && arr[i - 1] === "--gpus"));
            });

            if (newConfig.enableGpu) {
                // Add new GPU args
                let gpuFlag: string;
                if (newConfig.gpuMode === "all") {
                    gpuFlag = "all";
                } else if (newConfig.gpuMode === "count") {
                    gpuFlag = newConfig.gpuCount.toString();
                } else {
                    gpuFlag = `"device=${newConfig.gpuDevices}"`;
                }
                jsonObj.runArgs.push("--gpus", gpuFlag);

                // Set hostRequirements.gpu to true
                jsonObj.hostRequirements = jsonObj.hostRequirements || {};
                jsonObj.hostRequirements.gpu = true;

                // Set environment variables for CUDA if needed
                if (newConfig.setCudaEnv) {
                    jsonObj.remoteEnv = jsonObj.remoteEnv || {};
                    jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES =
                        (newConfig.gpuMode === "all") ? "all" :
                            (newConfig.gpuMode === "count") ?
                                Array.from({ length: newConfig.gpuCount }, (_, i) => i).join(',') :
                                newConfig.gpuDevices;
                    jsonObj.remoteEnv.NVIDIA_VISIBLE_DEVICES = jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES;
                }
            } else {
                // If GPU is disabled, remove hostRequirements.gpu flag
                if (jsonObj.hostRequirements?.gpu) {
                    jsonObj.hostRequirements.gpu = false;
                }

                // Remove CUDA environment variables
                if (jsonObj.remoteEnv) {
                    delete jsonObj.remoteEnv.CUDA_VISIBLE_DEVICES;
                    delete jsonObj.remoteEnv.NVIDIA_VISIBLE_DEVICES;
                }
            }

            // Write back to the file
            const edit = new vscode.WorkspaceEdit();
            const newText = JSON.stringify(jsonObj, null, 4);
            const fullRange = new vscode.Range(0, 0, document.lineCount, 0);
            edit.replace(devUri, fullRange, newText);
            await vscode.workspace.applyEdit(edit);
            await document.save();

            // Check for validation errors
            const diagnostics = vscode.languages.getDiagnostics(devUri);
            if (diagnostics.some(d => d.severity === vscode.DiagnosticSeverity.Error)) {
                vscode.window.showWarningMessage("devcontainer.json saved with validation errors. Please check the file.");
            } else {
                vscode.window.showInformationMessage("Dev container configuration updated successfully.");

                // Ask if the user wants to rebuild the container
                const rebuild = await vscode.window.showInformationMessage(
                    "Dev container configuration updated. Would you like to rebuild the container now?",
                    "Yes", "No"
                );

                if (rebuild === "Yes") {
                    vscode.commands.executeCommand('devcontainerEditor.rebuild');
                }
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to update devcontainer.json: ${err}`);
        }
    }

    private async _createDevcontainerJson(): Promise<void> {
        try {
            // Get the workspace folder
            const wsFolders = vscode.workspace.workspaceFolders;
            if (!wsFolders || wsFolders.length === 0) {
                vscode.window.showErrorMessage("No workspace folder is open.");
                return;
            }

            // Create .devcontainer directory if it doesn't exist
            const devcontainerDir = path.join(wsFolders[0].uri.fsPath, '.devcontainer');
            if (!fs.existsSync(devcontainerDir)) {
                fs.mkdirSync(devcontainerDir, { recursive: true });
            }

            // Create a basic devcontainer.json file
            const devcontainerPath = path.join(devcontainerDir, 'devcontainer.json');
            const basicConfig = {
                "$schema": "https://containers.dev/implementors/json_schema/devContainerSchema.json",
                "name": "Project Development",
                "image": "mcr.microsoft.com/devcontainers/base:ubuntu",  // Using a basic image
                "runArgs": [],
                "settings": {
                    "terminal.integrated.shell.linux": "/bin/bash"
                }
            };

            fs.writeFileSync(devcontainerPath, JSON.stringify(basicConfig, null, 4));

            vscode.window.showInformationMessage("Created new devcontainer.json with default configuration.");

            // Update the UI with the new file
            this._devContainerUri = vscode.Uri.file(devcontainerPath);
            this._updateWebviewFromFile();
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to create devcontainer.json: ${err}`);
        }
    }

    private async _findDevcontainerUri(): Promise<vscode.Uri | undefined> {
        const wsFolders = vscode.workspace.workspaceFolders;
        if (!wsFolders) return undefined; // No folder open

        // Check .devcontainer/devcontainer.json
        let devcontainerUri = vscode.Uri.joinPath(wsFolders[0].uri, '.devcontainer/devcontainer.json');
        try {
            await vscode.workspace.fs.stat(devcontainerUri);
            return devcontainerUri;
        } catch {
            // Fallback: check workspace root devcontainer.json
            devcontainerUri = vscode.Uri.joinPath(wsFolders[0].uri, 'devcontainer.json');
            try {
                await vscode.workspace.fs.stat(devcontainerUri);
                return devcontainerUri;
            } catch {
                // No devcontainer.json found
                return undefined;
            }
        }
    }

    private _updateWebviewFromFile(): void {
        // Reload the configuration from the file and update the webview
        this._loadDevcontainerJson();
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the local path to main script and CSS for the webview
        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
        );

        // Use a nonce to only allow a specific script to be run
        const nonce = this._getNonce();

        return /*html*/`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Devcontainer Editor</title>
    <style>
        body {
            padding: 0 20px;
            color: var(--vscode-foreground);
            font-size: var(--vscode-font-size);
            font-weight: var(--vscode-font-weight);
            font-family: var(--vscode-font-family);
            background-color: var(--vscode-editor-background);
        }
        .form-group {
            margin-bottom: 15px;
        }
        .sub-group {
            margin: 8px 0 8px 20px;
        }
        select, input[type="text"], input[type="number"] {
            width: 100%;
            padding: 5px;
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            margin-top: 5px;
        }
        label {
            display: block;
            margin-bottom: 5px;
        }
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 12px;
            margin-right: 8px;
            cursor: pointer;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .radio-group {
            margin: 5px 0;
        }
        #gpuOptions {
            margin-left: 20px;
            border-left: 1px solid var(--vscode-panel-border);
            padding-left: 10px;
        }
        .no-devcontainer {
            text-align: center;
            margin-top: 20px;
        }
        #applyBtn {
            margin-top: 20px;
        }
        hr {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div id="no-devcontainer-view" class="no-devcontainer" style="display: none;">
        <p>No devcontainer.json found in this workspace.</p>
        <button id="createDevcontainerBtn">Create devcontainer.json</button>
    </div>
    
    <div id="editor-view" style="display: none;">
        <h3>Dev Container Configuration</h3>
        
        <div class="form-group">
            <label for="networkMode">Network Mode:</label>
            <select id="networkMode">
                <option value="default">Default (Bridge)</option>
                <option value="host">Host</option>
                <option value="none">None</option>
                <option value="custom">Other (specify)</option>
            </select>
            
            <div id="customNetworkField" class="sub-group" style="display: none;">
                <label for="customNetworkName">Custom Network Name/ID:</label>
                <input type="text" id="customNetworkName" placeholder="Network name or ID">
            </div>
        </div>
        
        <hr>
        
        <div class="form-group">
            <div>
                <label>
                    <input type="checkbox" id="enableGpu"> Enable NVIDIA GPU support
                </label>
            </div>
            
            <div id="gpuOptions" style="display: none;">
                <p><strong>GPU Access:</strong></p>
                
                <div class="radio-group">
                    <label>
                        <input type="radio" name="gpuMode" value="all" checked> Use all GPUs (full access)
                    </label>
                </div>
                
                <div class="radio-group">
                    <label>
                        <input type="radio" name="gpuMode" value="count"> Limit GPU count:
                    </label>
                    <input type="number" id="gpuCount" value="1" min="1" style="width: 60px; display: inline-block;" disabled>
                </div>
                
                <div class="radio-group">
                    <label>
                        <input type="radio" name="gpuMode" value="devices"> Specify GPU devices:
                    </label>
                    <input type="text" id="gpuDevices" placeholder="e.g. 0,1" disabled>
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="setCudaEnv" checked> Set CUDA environment variables
                    </label>
                </div>
            </div>
        </div>
        
        <button id="applyBtn">Apply Changes</button>
        <button id="rebuildBtn">Apply & Rebuild Container</button>
    </div>
    
    <script nonce="${nonce}">
        // Get VS Code API
        const vscode = acquireVsCodeApi();
        
        // Elements
        const noDevcontainerView = document.getElementById('no-devcontainer-view');
        const editorView = document.getElementById('editor-view');
        const networkModeSelect = document.getElementById('networkMode');
        const customNetworkField = document.getElementById('customNetworkField');
        const customNetworkInput = document.getElementById('customNetworkName');
        const enableGpuCheckbox = document.getElementById('enableGpu');
        const gpuOptions = document.getElementById('gpuOptions');
        const gpuModeRadios = document.querySelectorAll('input[name="gpuMode"]');
        const gpuCountInput = document.getElementById('gpuCount');
        const gpuDevicesInput = document.getElementById('gpuDevices');
        const setCudaEnvCheckbox = document.getElementById('setCudaEnv');
        const applyBtn = document.getElementById('applyBtn');
        const rebuildBtn = document.getElementById('rebuildBtn');
        const createDevcontainerBtn = document.getElementById('createDevcontainerBtn');
        
        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            vscode.postMessage({ command: 'init' });
        });
        
        // Handle network mode selection
        networkModeSelect.addEventListener('change', () => {
            if (networkModeSelect.value === 'custom') {
                customNetworkField.style.display = 'block';
            } else {
                customNetworkField.style.display = 'none';
            }
        });
        
        // Handle GPU checkbox
        enableGpuCheckbox.addEventListener('change', () => {
            gpuOptions.style.display = enableGpuCheckbox.checked ? 'block' : 'none';
        });
        
        // Handle GPU mode selection
        gpuModeRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                const selectedMode = document.querySelector('input[name="gpuMode"]:checked').value;
                gpuCountInput.disabled = selectedMode !== 'count';
                gpuDevicesInput.disabled = selectedMode !== 'devices';
            });
        });
        
        // Apply changes button
        applyBtn.addEventListener('click', () => {
            sendConfigUpdate(false);
        });
        
        // Apply and rebuild button
        rebuildBtn.addEventListener('click', () => {
            sendConfigUpdate(true);
        });
        
        // Create devcontainer button
        createDevcontainerBtn.addEventListener('click', () => {
            vscode.postMessage({ command: 'createDevcontainer' });
        });
        
        // Send configuration to the extension
        function sendConfigUpdate(rebuild) {
            const selectedGpuMode = document.querySelector('input[name="gpuMode"]:checked').value;
            
            const config = {
                networkMode: networkModeSelect.value,
                customNetwork: customNetworkInput.value,
                enableGpu: enableGpuCheckbox.checked,
                gpuMode: selectedGpuMode,
                gpuCount: parseInt(gpuCountInput.value, 10),
                gpuDevices: gpuDevicesInput.value,
                setCudaEnv: setCudaEnvCheckbox.checked
            };
            
            vscode.postMessage({ 
                command: 'applyConfig', 
                config: config 
            });
            
            if (rebuild) {
                vscode.postMessage({ command: 'rebuildContainer' });
            }
        }
        
        // Handle messages from the extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'noDevcontainer':
                    noDevcontainerView.style.display = 'block';
                    editorView.style.display = 'none';
                    break;
                    
                case 'loadConfig':
                    // Show the editor view
                    noDevcontainerView.style.display = 'none';
                    editorView.style.display = 'block';
                    
                    // Update the UI with the loaded configuration
                    const config = message.config;
                    
                    // Set network mode
                    networkModeSelect.value = config.networkMode;
                    customNetworkInput.value = config.customNetwork || '';
                    customNetworkField.style.display = config.networkMode === 'custom' ? 'block' : 'none';
                    
                    // Set GPU options
                    enableGpuCheckbox.checked = config.enableGpu;
                    gpuOptions.style.display = config.enableGpu ? 'block' : 'none';
                    
                    // Set GPU mode
                    document.querySelector('input[name="gpuMode"][value="' + config.gpuMode + '"]').checked = true;
                    gpuCountInput.value = config.gpuCount;
                    gpuCountInput.disabled = config.gpuMode !== 'count';
                    gpuDevicesInput.value = config.gpuDevices;
                    gpuDevicesInput.disabled = config.gpuMode !== 'devices';
                    
                    // Set CUDA env checkbox
                    setCudaEnvCheckbox.checked = config.setCudaEnv;
                    break;
            }
        });
    </script>
</body>
</html>
        `;
    }

    private _getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}