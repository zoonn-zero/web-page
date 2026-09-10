#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 周刊自动发布脚本
==================================================
作用：把一周的 AI 快讯内容插入 js/data.js 的 magazines 数组最前面，
     校验 JS 语法无误后，自动 git 提交并推送到 GitHub（Pages 随即更新）。

用法：
    python tools/publish_weekly.py content.json            # 插入 + 推送
    python tools/publish_weekly.py content.json --no-push  # 只插入不推送
    python tools/publish_weekly.py content.json --dry-run  # 只看结果不写文件

content.json 格式（items 里放本周的快讯，条数不限）：
{
  "date": "2026-09-10",
  "summary": "显示在杂志卡片上的一句话简介",
  "title": "AI 周刊 Vol.05",          <- 可选，不写则自动编号
  "items": [
    {
      "tag": "模型与产品发布",         <- 分类标签
      "heading": "小标题",
      "detail": "详细说明，1-3 句。",
      "comment": "一句点评（可选）"
    }
  ]
}
"""

import json
import os
import re
import shutil
import subprocess
import sys
import time

# 脚本所在项目根目录
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "js", "data.js")
TARGET_DIR = os.path.join(ROOT, "js")


def die(msg):
    print("[失败] " + msg)
    sys.exit(1)


def find_node():
    """找到可用的 node，用于校验 JS 语法。"""
    node = shutil.which("node")
    if node:
        return node
    for p in [
        r"C:\Users\znn\.workbuddy\binaries\node\versions\22.22.2-2\node.exe",
        r"D:\general\nodejs\node.exe",
    ]:
        if os.path.exists(p):
            return p
    return None


def escape_for_template_literal(text):
    """HTML 放进 JS 反引号模板字符串里，需转义反引号和 ${。"""
    return text.replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")


def to_html(items, date, count):
    """把快讯条目转成咖啡馆详情弹窗支持的 HTML。"""
    parts = ['<h3>本周 AI 快讯</h3>']
    parts.append('<p class="weekly-meta">%s · 共 %d 条</p>' % (date, count))
    for it in items:
        tag = it.get("tag", "").strip()
        heading = it.get("heading", "").strip()
        detail = it.get("detail", "").strip()
        comment = it.get("comment", "").strip()
        title = ("【%s】%s" % (tag, heading)) if tag else heading
        parts.append("<h3>%s</h3>" % title)
        if detail:
            parts.append("<p>%s</p>" % detail)
        if comment:
            parts.append('<p class="weekly-comment">%s</p>' % comment)
    return "\n".join(parts)


def next_vol_number(data_js_text):
    """扫描已有的 AI 周刊标题，算出下一期编号。"""
    nums = [int(n) for n in re.findall(r"AI 周刊 Vol\.(\d+)", data_js_text)]
    return (max(nums) + 1) if nums else 1


def main():
    args = [a for a in sys.argv[1:]]
    no_push = "--no-push" in args
    dry_run = "--dry-run" in args
    files = [a for a in args if not a.startswith("--")]

    if not files:
        die("请提供内容文件，例如：python tools/publish_weekly.py content.json")
    content_path = files[0]
    if not os.path.exists(content_path):
        die("内容文件不存在：" + content_path)

    with open(content_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    items = data.get("items") or []
    if not items:
        die("content.json 里 items 为空，没有内容可发布。")

    if not os.path.exists(DATA_JS):
        die("找不到 data.js：" + DATA_JS)

    with open(DATA_JS, "r", encoding="utf-8", newline="") as f:
        original = f.read()

    # 保住原文件的换行符（本机是 CRLF），避免整文件 diff
    nl = "\r\n" if "\r\n" in original else "\n"

    # 定位 magazines 数组的起始位置
    anchor = re.search(r"const\s+magazines\s*=\s*\[", original)
    if not anchor:
        die("data.js 里找不到 magazines 数组，格式可能被改动过。")
    insert_at = anchor.end()

    vol = next_vol_number(original)
    title = (data.get("title") or "").strip() or ("AI 周刊 Vol.%02d" % vol)
    summary = (data.get("summary") or "").strip() or ("本周 AI 快讯，共 %d 条" % len(items))
    date = (data.get("date") or "").strip()
    if not date:
        die("content.json 缺少 date 字段。")

    body = to_html(items, date, len(items))

    entry = (
        "\n  {\n"
        '    title: "%s",\n'
        '    summary: "%s",\n'
        '    videoUrl: "#",\n'
        '    emoji: "\\u{1F4F0}",\n'
        "    content: `\n%s\n    `\n"
        "  },"
    ) % (
        escape_for_template_literal(title).replace('"', '\\"'),
        escape_for_template_literal(summary).replace('"', '\\"'),
        escape_for_template_literal(body),
    )

    updated = original[:insert_at] + entry.replace("\n", nl) + original[insert_at:]

    # 生成预览
    print("=" * 56)
    print("即将发布：%s（%s，%d 条）" % (title, date, len(items)))
    print("=" * 56)

    if dry_run:
        print(entry)
        print("=" * 56)
        print("[dry-run] 未写入任何文件。")
        return

    # 备份 -> 写入 -> 校验
    backup = original
    with open(DATA_JS, "w", encoding="utf-8", newline="") as f:
        f.write(updated)

    node = find_node()
    if node:
        r = subprocess.run([node, "--check", DATA_JS], capture_output=True, text=True)
        if r.returncode != 0:
            with open(DATA_JS, "w", encoding="utf-8", newline="") as f:
                f.write(backup)
            die("生成的 data.js 语法有误，已自动还原。node 报错：\n" + r.stderr.strip())
        print("[1/3] 已写入 data.js，语法校验通过")
    else:
        print("[1/3] 已写入 data.js（未找到 node，跳过语法校验）")

    if no_push:
        print("[完成] --no-push，未推送到 GitHub。")
        return

    # git 提交与推送
    if not os.path.isdir(os.path.join(ROOT, ".git")):
        print("[2/3] 本地不是 git 仓库，跳过推送。请手动上传 data.js 到 GitHub。")
        return

    def run_git(args, check=True, retries=3):
        """执行 git 命令；网络类失败时自动重试（GitHub 偶发连不上）。"""
        env = dict(os.environ)
        env["GCM_INTERACTIVE"] = "never"      # 无人值守，禁止弹登录窗
        env["GIT_TERMINAL_PROMPT"] = "0"
        last = None
        for attempt in range(1, retries + 1):
            r = subprocess.run(
                ["git"] + list(args), cwd=ROOT, capture_output=True, text=True, env=env
            )
            if r.returncode == 0:
                return r
            last = r
            msg = (r.stderr or "") + (r.stdout or "")
            retryable = any(
                k in msg
                for k in (
                    "unable to access", "Could not resolve", "Connection",
                    "timed out", "502", "Recv failure", "Could not read from remote",
                )
            )
            if attempt < retries and retryable:
                wait = 5 * attempt
                print("     网络波动，%d 秒后重试（第 %d/%d 次）..." % (wait, attempt, retries - 1))
                time.sleep(wait)
                continue
            break
        if check:
            print(last.stdout)
            print(last.stderr)
            die("git %s 执行失败" % " ".join(args))
        return last

    # 先同步远端，避免冲突
    pull = run_git(["pull", "--rebase", "--autostash", "origin", "main"], check=False)
    if pull.returncode != 0:
        print("[2/3] git pull 有警告（可能是首次推送或无远端更新），继续：")
        print((pull.stderr or pull.stdout).strip()[:300])
    else:
        print("[2/3] 已与 GitHub 同步")

    run_git(["add", "js/data.js"])
    # 若索引里没变化（内容与上期完全一致），跳过提交
    diff = run_git(["diff", "--cached", "--quiet"], check=False)
    if diff.returncode == 0:
        print("[完成] data.js 无变化，无需提交。")
        return
    run_git(["commit", "-m", "%s（%s）" % (title, date)])
    run_git(["push", "origin", "main"])
    print("[3/3] 已推送到 GitHub")
    print("[完成] %s 发布成功，GitHub Pages 约 1 分钟后自动更新。" % title)


if __name__ == "__main__":
    main()
