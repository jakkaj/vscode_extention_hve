import * as vscode from 'vscode';
import { DevContainerViewProvider } from './devContainerViewProvider';

export function activate(context: vscode.ExtensionContext) {
    // Register the webview provider for the sidebar
    const provider = new DevContainerViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            DevContainerViewProvider.viewType,
            provider
        )
    );

    // Register the command to rebuild the dev container
    context.subscriptions.push(
        vscode.commands.registerCommand('devcontainerEditor.rebuild', async () => {
            try {
                // Try to execute the VS Code command for rebuilding containers
                await vscode.commands.executeCommand('remote-containers.rebuildContainer');
                vscode.window.showInformationMessage('Rebuilding Dev Container...');
            } catch (err) {
                vscode.window.showErrorMessage('Failed to rebuild Dev Container. Make sure the Remote - Containers extension is installed.');
            }
        })
    );
}

export function deactivate() {
    // Clean up resources if needed
}