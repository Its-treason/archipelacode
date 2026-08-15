/** @format */

import * as vscode from "vscode";
import { apController } from "../archipelago";
import { queryQuestionDetail } from "../leetcode";
import { archipelacodeChannel } from "../outputChannel";
import { IQuickItemEx } from "../shared";
import { ArchipelaCodeTreeViewNode } from "../treeView/treeViewNode";
import { genFileExt, isFileEmpty } from "../utils";

export async function openProblemInEditor(node: ArchipelaCodeTreeViewNode) {
  const titleSlug = node.titleSlug;
  const problem = await queryQuestionDetail(titleSlug);
  if (await apController.hasLocationBeenClaimedPreviously(titleSlug)) {
    vscode.window.showInformationMessage(
      "You've already claimed this location!",
    );
  } else {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("No workspace folder open.");
      return;
    }
    const includedLangSlugs = apController.getIncludedLangSlugs();
    const picks: Array<IQuickItemEx<string>> = problem.codeSnippets
      .filter((entry) => includedLangSlugs.includes(entry.langSlug))
      .map((entry) => ({
        label: entry.lang,
        value: entry.langSlug,
      }));

    if (picks.length === 0) {
      const message =
        `No language to solve "${titleSlug}" in. Your slot allows ` +
        `[${includedLangSlugs.join(", ")}], but LeetCode only offers ` +
        `[${problem.codeSnippets.map((entry) => entry.langSlug).join(", ")}] ` +
        `for this problem. Try setting "archipelacode.languageOverride".`;
      vscode.window.showErrorMessage(message);
      archipelacodeChannel.appendLine(message);
      return;
    }

    const choice: IQuickItemEx<string> | undefined =
      await vscode.window.showQuickPick(picks, {
        placeHolder: "Select the language to solve this problem in",
        title:
          apController.isUsingLanguageFallback() ?
            "Archipelago didn't report your language - pick the one your slot was generated for"
          : undefined,
      });
    if (!choice) {
      return;
    }
    let langSlug = choice.value;
    let langExtension = genFileExt(langSlug);
    let fileName = `${titleSlug}.${langExtension}`;

    const rootUri = workspaceFolders[0].uri;
    const filePath = vscode.Uri.joinPath(rootUri, fileName);

    const wsedit = new vscode.WorkspaceEdit();
    wsedit.createFile(filePath, { ignoreIfExists: true });

    try {
      await vscode.workspace.applyEdit(wsedit);
    } catch {
      archipelacodeChannel.appendLine(
        `Failed to create file at path "${filePath.toString()}"`,
      );
    }

    await vscode.window.showTextDocument(
      await vscode.workspace.openTextDocument(filePath),
    );

    if (await isFileEmpty(filePath)) {
      let codeSnippet = problem.codeSnippets.find(
        (item) => item.langSlug === langSlug,
      );
      try {
        const encodedData = new TextEncoder().encode(codeSnippet?.code);
        await vscode.workspace.fs.writeFile(filePath, encodedData);
      } catch {
        archipelacodeChannel.appendLine("Error writing code snippet to file.");
      }
    }
  }
}
