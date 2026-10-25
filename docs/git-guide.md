# 第一次用 agent 发布 GitHub

Git 负责本地版本历史；GitHub 托管远程仓库。GitHub 连接器的登录与本机命令行 Git 的登录可能分别维护，所以连接器可读仓库并不保证 `git push` 已能使用。

## 首次发布的步骤

下面是可复用的 PowerShell 示例，路径应指向你的项目。每一步成功后再进行下一步。首次发布的实际结果记录在本地交付的发布说明中。

```powershell
git init -b main
git status --short
git add README.md LICENSE .gitignore .gitattributes skills docs evals scripts .github
git diff --cached --stat
git diff --cached
git commit -m "Add domain-specific plain writing skills and research"
```

`init` 创建版本库，`add` 选择进入下一次提交的文件，`diff --cached` 检查所选内容，`commit` 保存本地快照。只把明确列出的项目文件放入暂存区，检查私人信息、密钥与临时文件。

提交身份属于 Git 的署名配置。可以只为这个仓库设置，避免影响其他项目：

```powershell
git config --local user.name "YOUR_GITHUB_LOGIN"
git config --local user.email "YOUR_GITHUB_NOREPLY_EMAIL"
```

使用 GitHub 设置页面提供的 noreply 地址；上述两行中的占位值不能原样执行。如果 agent 已从可信账户资料核实身份，可以直接配置。用户名和邮箱本身不能授予 GitHub 上传权限。

## 创建远程并推送

如果使用已安装的 GitHub CLI：

```powershell
gh auth status
gh auth login --hostname github.com --git-protocol https --web
gh repo create Lucifer9331/plain-work --public --source . --remote origin
git push -u origin main
git ls-remote origin refs/heads/main
git rev-parse HEAD
```

登录需要账户持有人在 GitHub 完成授权。不要把密码、访问令牌或验证码粘贴到公开仓库。两条 SHA 查询一致，才说明远程 `main` 包含当前本地提交；网页还应核对公开范围、README 和文件是否完整。

如果先在网页创建空仓库，改用：

```powershell
git remote add origin https://github.com/Lucifer9331/plain-work.git
git push -u origin main
```

仓库如果已存在且有内容，先查看远程历史，避免覆盖他人的提交。初次上传不需要强制推送。

## 之后修改

```powershell
git status --short
git diff
python scripts/validate.py
git add skills/plain-docs/SKILL.md
git diff --cached
git commit -m "Clarify documentation editing guidance"
git push
```

提交后发现问题，可以再提交一次修复，历史中会保留修改缘由。多人协作或希望审阅时，再使用分支和 Pull Request；第一次空仓库发布可以直接推送 `main`。

常见失败：`Authentication failed` 需要修复本机登录；`Repository not found` 需要检查账户、地址与权限；`rejected (fetch first)` 表示远程有本地尚未包含的提交。先查看状态和历史，保留已有工作。
