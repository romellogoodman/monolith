Create a git commit with the staged and unstaged changes.

Follow these steps:
1. Run `git status` to see all untracked and modified files
2. Run `git diff` to see unstaged changes
3. Run `git diff --staged` to see staged changes
4. Review recent commits with `git log --oneline -5` to understand the commit message style
5. Analyze all changes and create a clear, concise commit message that:
   - Summarizes what was changed and why
   - Follows the repository's existing commit message conventions
   - Focuses on the purpose and impact of the changes
6. Stage any relevant untracked or modified files using `git add`
7. Create the commit with the message ending with:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>

Do not push the commit unless explicitly requested.
