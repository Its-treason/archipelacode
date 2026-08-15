<!-- @format -->

# ArchipelaCode

Archipelago implementation for LeetCode problems inside of Visual Studio Code.

## Troubleshooting

### The language picker is empty

APWorld v0.0.2 and older only ever report `python3` and `javascript` in their slot
data, so a slot generated for Typescript or Golang looks like it has no language
enabled at all. The extension falls back to the languages the slot data never
mentioned, but you can also pin your language explicitly by setting
`archipelacode.languageOverride` to `python3`, `javascript`, `typescript` or
`golang`. Neither needs the world to be regenerated.

Huge thank you to [jdneo](https://github.com/jdneo) and everyone who has worked on the [LeetCode extension](https://github.com/LeetCode-OpenSource/vscode-leetcode) for VSC. I don't think this extension would be possible without the work you all initially did. Full credits for most of the LeetCode connection logic to them!