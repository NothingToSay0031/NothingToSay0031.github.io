---
title: Windows Development Environment
date: 2023-03-26 15:04:10
description: 工欲善其事，必先利其器。
---

# Windows

VS Code

PowerToys

Snipaste

PicGo

WSL2

TeX Live

# Windows Subsystem for Linux 

## Shell

### zsh

将zsh作为默认的 Shell 环境 `chsh -s $(which zsh)` 

插件

- [oh-my-zsh](https://ohmyz.sh/)
- [powerlevel10k](https://github.com/romkatv/powerlevel10k)
- [zsh-syntax-highlighting](https://github.com/zsh-users/zsh-syntax-highlighting)
- [zsh-autosuggestions](https://github.com/zsh-users/zsh-autosuggestions)
- [zsh-history-substring-search](https://github.com/zsh-users/zsh-history-substring-search)
- z
- sudo
- extract
- docker

### 配置与 GitHub 连接的 SSH 密钥

- 在 WSL 下生成 SSH 公钥 — 私钥对（将邮箱替换为你的邮箱），此时生成的 SSH 密钥默认位于 `~/.ssh` 路径下，公钥为 `id_rsa.pub`，私钥为 `id_rsa`：

  ```bash
  $ ssh-keygen -t rsa -b 4096 -C "email@ex.com"
  ```

- 打开 ssh-agent 使之在后台运行：

  ```bash
  $ eval "$(ssh-agent -s)"
  ```

- 将私钥添加到 ssh-agent 之中：

  ```bash
  $ ssh-add ~/.ssh/id_rsa
  ```

- 查看公钥并将之复制到剪贴板：

  ```bash
  # 查看公钥内容
  $ cat ~/.ssh/id_rsa.pub
  
  # 将公钥复制到剪贴板
  $ cat ~/.ssh/id_rsa.pub | clip.exe
  ```

- 将复制好的公钥添加到 GitHub 账户密钥里面：[Adding a new SSH key to your GitHub account - GitHub Help](https://help.github.com/en/github/authenticating-to-github/adding-a-new-ssh-key-to-your-github-account).

- 通过命令 `ssh -T git@github.com` 来测试是否能够登录成功。

### 配置代理

在 `~/.zshrc` 或你使用的 Shell 的配置文件中添加内容，实现自动化配置代理：

```bash
# Fetch Windows ip address inside WSL environment
WINDOWS_IP=$(ip route | grep default | awk '{print $3}')
PROXY_HTTP="http://${WINDOWS_IP}:7890"
PROXY_SOCKS5="${WINDOWS_IP}:7890"

# Git & SSH for Git proxy
proxy_git () {
  git config --global http.https://github.com.proxy ${PROXY_HTTP}
  if ! grep -qF "Host github.com" ~/.ssh/config ; then
    echo "Host github.com" >> ~/.ssh/config
    echo "  User git" >> ~/.ssh/config
    echo "  ProxyCommand nc -X 5 -x ${PROXY_SOCKS5} %h %p" >> ~/.ssh/config
  else
    lino=$(($(awk '/Host github.com/{print NR}'  ~/.ssh/config)+2))
    sed -i "${lino}c\  ProxyCommand nc -X 5 -x ${PROXY_SOCKS5} %h %p" ~/.ssh/config
  fi
}

# Set proxy
set_proxy () {
  export http_proxy="${PROXY_HTTP}"
  export https_proxy="${PROXY_HTTP}"
  proxy_git
}

# Unset proxy
unset_proxy () {
  unset http_proxy
  unset https_proxy
  git config --global --unset http.https://github.com.proxy
}

# Set alias
alias proxy=set_proxy
alias deproxy=unset_proxy
```

其中：

- 第一行 `WINDOWS_IP=$(ip route | grep default | awk '{print $3}')` 让我们使用 WSL 2 时可以自动获取最新的 WSL IP 地址，WSL 1 可以直接将 `WINDOWS_IP` 设置为 `127.0.0.1`；
- 之后的 `PROXY_HTTP` 和 `PROXY_SOCKS5` 分别是我们代理的 HTTP 协议地址和 SOCKS5 地址；
- 函数 `proxy_git()` 让我们直接设置 Git 自己的代理和 ssh 登录 GitHub 的代理；
- 后续的 `set_proxy()` 和 `unset_proxy()` 就分别是设定 Git 代理和环境变量，以及取消 Git 代理、删除环境变量；


#### v2ray
查看宿主机IP和端口，使用命令：ip route | grep default | awk '{print $3}，在v2ray主界面可以看到http代理端口。
```
export hostip=$(ip route | grep default | awk '{print $3}')
export hostport=10809
alias proxy='
    export https_proxy="http://${hostip}:${hostport}";
    export http_proxy="http://${hostip}:${hostport}";
    export all_proxy="http://${hostip}:${hostport}";
    git config --global http.proxy "http://${hostip}:${hostport}"
    git config --global https.proxy "http://${hostip}:${hostport}"
    echo -e "Acquire::http::Proxy \"http://${hostip}:${hostport}\";" | sudo tee -a /etc/apt/apt.conf.d/proxy.conf > /dev/null;
    echo -e "Acquire::https::Proxy \"http://${hostip}:${hostport}\";" | sudo tee -a /etc/apt/apt.conf.d/proxy.conf > /dev/null;
'
alias deproxy='
    unset https_proxy;
    unset http_proxy;
    unset all_proxy;
    git config --global --unset http.proxy
    git config --global --unset https.proxy
    sudo sed -i -e '/Acquire::http::Proxy/d' /etc/apt/apt.conf.d/proxy.conf;
    sudo sed -i -e '/Acquire::https::Proxy/d' /etc/apt/apt.conf.d/proxy.conf;
'
```
使用命令 `proxy` 和 `deproxy` 即可开关代理。

## VS Code

### 个性化

字体 

- **Fira Code**
- **FiraCode Nerd Font Mono**
- JetBrains Mono 

主题
- **GitHub Theme**
- **Material Icon Theme**
- Dracula Refined
- Everforest 
- **Dracula**

### 插件

- LeetCode
- Vim
- Code Runner
- C/C++ (Pre-Release Version)
- CMake
- CMake Tools (Pre-Release Version)
- WSL
- Error Lens
- CodeLLDB

# VS Code JSON

```json
// settings.json
{
    "editor.fontFamily": "'Fira Code Retina', 'Cascadia Mono', '思源宋体'",
    "terminal.integrated.fontFamily": "'FiraCode Nerd Font Mono'"
    "workbench.colorTheme": "GitHub Light",
    "workbench.iconTheme": "material-icon-theme",
    "vim.useSystemClipboard": true,
    "vim.sneak": true,
    "vim.camelCaseMotion.enable": true,
    "vim.easymotion": true,
    "vim.highlightedyank.enable": true,
    "vim.hlsearch": true,
    "vim.handleKeys": {
        "<C-c>": false,
        "<C-z>": false,
        "<C-y>": false,
        "<C-x>": false,
        "<C-v>": false,
    },
    "vim.replaceWithRegister": true,
    "vim.smartRelativeLine": true,
    "vim.sneakUseIgnorecaseAndSmartcase": true,
    "vim.targets.enable": true,
    "vim.visualstar": true,
}
```

```json  
// keybindings.json
[
    {
        "key": "alt+j",
        "command": "selectNextSuggestion",
        "when": "suggestWidgetMultipleSuggestions && suggestWidgetVisible && textInputFocus || suggestWidgetVisible && textInputFocus && !suggestWidgetHasFocusedSuggestion"
    },
    {
        "key": "alt+k",
        "command": "selectPrevSuggestion",
        "when": "suggestWidgetMultipleSuggestions && suggestWidgetVisible && textInputFocus || suggestWidgetVisible && textInputFocus && !suggestWidgetHasFocusedSuggestion"
    }
]
```

# Vim Shortcuts

**A Good Tutorial Video: [Youtube](https://www.youtube.com/watch?v=5nHdG0MdK1Y), [Bilibili](https://www.bilibili.com/video/BV1qD4y1W7aG/?spm_id_from=333.999.0.0&vd_source=a32bcb316a5f16efd4a398938b585caf)**

`n` stands for `NORMAL` mode, `i` stands for `INSERT` mode, `v` stands for `VISUAL` mode.

### Open and Close Files

| Mode | Shortcut | Description                                               |
| ---- | -------- | --------------------------------------------------------- |
| `n`  | `:w`     | Write(save) current buffer                                |
| `n`  | `:q`     | Close current buffer (would fail if you don't save first) |
| `n`  | `:wq`    | Save and close current buffer                             |
| `n`  | `:q!`    | Exit current buffer without saving                        |
| `n`  | `:qa!`   | Exit all open buffers without saving                      |
| `n`  | `:wqa`   | Save and exit all open buffers                            |

### Navigation

| Mode     | Shortcut                         | Description                                                                  |
| -------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `n`, `v` | `h`                              | Move left                                                                    |
| `n`, `v` | `j`                              | Move down                                                                    |
| `n`, `v` | `k`                              | Move up                                                                      |
| `n`, `v` | `l`                              | Move right                                                                   |
| `n`, `v` | `w`                              | One word forward                                                             |
| `n`, `v` | `b`                              | One word backward                                                            |
| `n`, `v` | `^`                              | Beginning of line                                                            |
| `n`, `v` | `$`                              | End of line                                                                  |
| `n`, `v` | `gg`                             | Beginning of file                                                            |
| `n`, `v` | `G`                              | End of file                                                                  |
| `n`, `v` | `{`                              | One paragraph backward                                                       |
| `n`, `v` | `}`                              | One paragraph forward                                                        |
| `n`, `v` | `f` + `[char]`                   | Move to next occurence of `[char]` in current line (Covered in Part 2 video) |
| `n`, `v` | `F` + `[char]`                   | Move to prev occurence of `[char]` in current line (Covered in Part 2 video) |
| `n`, `v` | `Ctrl`+`u`                       | Move Up half a Page (Covered in Part 2 video)                                |
| `n`, `v` | `Ctrl`+`d`                       | Move Down half a Page (Covered in Part 2 video)                              |
| `n`, `v` | `Ctrl`+`b`                       | Move Up a Full Page (Covered in Part 2 video)                                |
| `n`, `v` | `Ctrl`+`f`                       | Move Down a Full Page (Covered in Part 2 video)                              |
| `n`      | `:[num-of-line]` + `Enter`       | Go to a specific line                                                        |
| `n`, `v` | `/[search-item]` + `Enter` + `n` | Find pattern and go to next match                                            |

### Enter `INSERT` Mode from `NORMAL` Mode

| Mode | Shortcut             | Description                                                                        |
| ---- | -------------------- | ---------------------------------------------------------------------------------- |
| `n`  | `i`                  | Insert before cursor                                                               |
| `n`  | `a`                  | Append after cursor                                                                |
| `n`  | `I`                  | Insert at the beginning of the line                                                |
| `n`  | `A`                  | Append at the end of the line                                                      |
| `n`  | `o`                  | Insert to next line                                                                |
| `n`  | `O`                  | Insert to previous line                                                            |
| `n`  | `c` + `[Navigation]` | Delete from before the cursor to `[Navigation]` and insert. Examples are as follow |
| `n`  | `c` + `w`            | Delete from before the cursor to end of current word and insert                    |
| `n`  | `c` + `i` + `w`      | Delete current word and insert                                                     |
| `n`  | `c` + `$`            | Delete from before the cursor to end of the line and insert                        |
| `i`  | `<Esc>`              | Go back to Normal Mode, remap to `jk` recommended                                  |

### Enter `INSERT` Mode from `NORMAL` Mode

| Mode | Shortcut             | Description                                                                        |
| ---- | -------------------- | ---------------------------------------------------------------------------------- |
| `n`  | `i`                  | Insert before cursor                                                               |
| `n`  | `a`                  | Append after cursor                                                                |
| `n`  | `I`                  | Insert at the beginning of the line                                                |
| `n`  | `A`                  | Append at the end of the line                                                      |
| `n`  | `o`                  | Insert to next line                                                                |
| `n`  | `O`                  | Insert to previous line                                                            |
| `n`  | `c` + `[Navigation]` | Delete from before the cursor to `[Navigation]` and insert. Examples are as follow |
| `n`  | `c` + `w`            | Delete from before the cursor to end of current word and insert                    |
| `n`  | `c` + `i` + `w`      | Delete current word and insert                                                     |
| `n`  | `c` + `$`            | Delete from before the cursor to end of the line and insert                        |
| `i`  | `<Esc>`              | Go back to Normal Mode, remap to `jk` recommended                                  |

### Edit in `NORMAL` Mode

| Mode | Shortcut                                    | Description                                                                                                                                                   |
| ---- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `n`  | `dd`                                        | Delete(cut) current line                                                                                                                                      |
| `n`  | `d` + `[Number]` + `d` Or `[Number]` + `dd` | Delete(cut) following `[Number]` of lines                                                                                                                     |
| `n`  | `d` + `[Navigation]`                        | Delete(cut) from before the cursor to `[Navigation]`, similar to `c` + `[Navigation]` above                                                                   |
| `n`  | `yy`                                        | Yank(copy) current line                                                                                                                                       |
| `n`  | `y` + `[Number]` + `y` Or `[number]` + `yy` | Yank(copy) following `[Number]` of lines                                                                                                                      |
| `n`  | `y` + `[Navigation]`                        | Yank(copy) from before the cursor to `[Navigation]`, similar to `c` + `[Navigation]` above                                                                    |
| `n`  | `p`                                         | Paste from what you delete or yank                                                                                                                            |
| `n`  | `x`                                         | Delete(cut) the character under the cursor                                                                                                                    |
| `n`  | `u`                                         | Undo changes                                                                                                                                                  |
| `n`  | `Ctrl`+`r`                                  | Redo changes                                                                                                                                                  |
| `n`  | `:%s/[foo]/[bar]/g`                         | Find each occurrence of `[foo]` (in all lines), and replace it with `[bar]`. More substitute commands [here](https://vim.fandom.com/wiki/Search_and_replace). |

### `VISUAL` mode shortcuts

| Mode     | Shortcut   | Description                                 |
| -------- | ---------- | ------------------------------------------- |
| `n`      | `v`        | Enter Visual Character Mode                 |
| `n`      | `V`        | Enter Visual Line Mode                      |
| `V-Line` | `>`; `<`   | Increase Indent; Decrease Indent            |
| `n`      | `Ctrl`+`v` | Enter Visual Block Mode                     |
| `v`      | `<Esc>`    | Exit Visual Mode, remap to `jk` recommended |

### Vim settings under VSCode

1. Press `Ctrl/Cmd+Shift+p` in VSCode
2. Find `Preferences: Open User Settings (JSON)`, open `settings.json`
3. Configure the file, all options are [here](https://github.com/VSCodeVim/Vim)

# VScode Vim

### Edit in `NORMAL`

| Package        | Shortcut                      | Description                                                                                       | Remap Needed?      |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------------- | ------------------ |
| Vim            | `gb`                          | Mutlicursor operation                                                                             |
| VScode         | `Ctrl+n`                      | Rename all the pattern that is under the cursor                                                   | `keybindings.json` |
| Vim Commentary | `gcc` / `gc5j`                | Toggle comment on this line / next 5 line(not including current line)                             |
| EasyMotion     | `<leader><leader>s+[char]`    | Quick navigation to `[char]` on the screen(more motion on doc)                                    |                    |
| Vim-surround   | `ys[motion][symbol]`, `ysiw)` | Yank `[symbol]` around `[motion]`, the example means surround the word under the cursor with `()` |                    |
| Vim-surround   | `cs[symbol][newsymbol]`       | Change `[symbol]` to `[newsymbol]` when your cursor is within the `[symbol]`                      |                    |
| Vim Sneak      | `<operator>z<char><char>`     | Do `[operator]` until the next occurence of `<char><char>`                                        |
| Vim Sneak      | `3dzqt`                       | An example: Delete everything until the next 3rd occurence of `qt`                                |

### Tab, File and Window Navigation

| Package | Shortcut               | Description                                                          | Remap Needed?      |
| ------- | ---------------------- | -------------------------------------------------------------------- | ------------------ |
| VSCode  | `ctrl + d`             | Toggle peek definition                                               | `keybindings.json` |
| Vim     | `gd`                   | Go to Definition                                                     |                    |
| Vim     | `gh`                   | Hover doc                                                            |                    |
| VScode  | `cmd/ctrl+p`           | Search file by name and open                                         |                    |
| Vim     | `tp`, `tn`, `tf`, `tl` | In the current editor group: prev tab, next tab, first tab, last tab | `settings.json`    |
| VScode  | `ctrl+z`               | Switch focus between editor and terminal                             | `keybindings.json` |
| VScode  | `cmd/ctrl+j`           | Hide Terminal                                                        |                    |
| VScode  | `cmd/ctrl+b`           | Toggle File explorer                                                 |                    |

### Editor Group Navigation

| Package | Shortcut       | Description                     | Remap Needed?      |
| ------- | -------------- | ------------------------------- | ------------------ |
| VSCode  | `ctrl + \`     | Split Editor                    | `keybindings.json` |
| VSCode  | `ctrl + h/l`   | Move to left/right editor group | `keybindings.json` |
| VSCode  | `cmd/ctrl + k + w` | Close all tabs in active editor group              |                    |

For the emulated Vim plugins, some of them need to turn them on in `settings.json` as well, refer to the doc to see if that is required.

```json
// settings.json
{
  "vim.useCtrlKeys": true,
  "vim.handleKeys": {
      "<C-c>": false,
      "<C-z>": false,
      "<C-x>": false,
      "<C-v>": false,
      "<C-f>": false,
      "<C-y>": false,
  },
  "vim.useSystemClipboard": true,
  "vim.insertModeKeyBindings": [
    {
      "before": ["i", "i"],
      "after": ["<Esc>"]
    }
  ],
  "vim.visualModeKeyBindings": [
    {
      "before": ["i", "i"],
      "after": ["<Esc>"]
    }
  ],
  "vim.normalModeKeyBindings": [
    {
      "before": ["<leader>", "t", "n"],
      "commands": [":tabnext"]
    },
    {
      "before": ["<leader>", "t", "p"],
      "commands": [":tabprev"]
    },
    {
      "before": ["<leader>", "t", "f"],
      "commands": [":tabfirst"]
    },
    {
      "before": ["<leader>", "t", "l"],
      "commands": [":tablast"]
    }
  ],
  "vim.ignorecase": false,
  "vim.leader": " ",
  "vim.easymotion": true,
  "vim.sneak": true,
  "vim.surround": true,
  "vim.statusBarColorControl": true,
  "vim.statusBarColors": {
    "normal": "#005f5f",
    "insert": "#5f0000",
    "visual": "#5f00af",
    "visualline": "#005f87",
    "visualblock": "#86592d",
    "replace": "#000000"
  },
  "workbench.colorCustomizations": {
    "statusBar.background": "#5f0000",
    "statusBar.noFolderBackground": "#5f0000",
    "statusBar.debuggingBackground": "#5f0000"
  }
}

```

```json
// keybindings.json
[
  { "key": "ctrl+d", "command": "editor.action.peekDefinition" },
  {
    "key": "ctrl+d",
    "command": "editor.closeTestPeek",
    "when": "testing.isInPeek && !config.editor.stablePeek || testing.isPeekVisible && !config.editor.stablePeek"
  },
  { "key": "ctrl+n", "command": "editor.action.rename" },
  { "key": "ctrl+z", "command": "workbench.action.terminal.focus" },
  {
    "key": "ctrl+z",
    "command": "workbench.action.focusActiveEditorGroup",
    "when": "terminalFocus"
  },
  { "key": "ctrl+m", "command": "workbench.action.toggleEditorWidths" },
  { "key": "ctrl+\\", "command": "workbench.action.splitEditor" },
  { "key": "ctrl+h", "command": "workbench.action.navigateLeft" },
  { "key": "ctrl+l", "command": "workbench.action.navigateRight" },
  { "key": "ctrl+w", "command": "workbench.action.closeEditorsAndGroup" }
]

```

