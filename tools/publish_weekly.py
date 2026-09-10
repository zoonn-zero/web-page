#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 周刊自动发布脚本
==================================================
作用：把一周的 AI 快讯内容插入 js/data.js 的 weeklyIssues 数组最前面（最新一期在最上面），
     校验 JS 语法无误后，自动 git 提交并推送到 GitHub（Pages 随即更新）。

用法：
    python tools/publish_weekly.py content.json            # 插入 + 推送
    python tools/publish_weekly.py content.json --no-push  # 只插入不推送
    python tools/publish_weekly.py content.json --dry-run  # 只看结果不写文件

content.json 格式（items 里放本周的快讯，条数不限）：
{
  "date": "2026-09-14",
  "headline": "本期主标题（显示在期刊封面最显眼处）",
  "summary": "一句话概览（20-40 字）",
  "minutes": 4,                       <- 可选，不写则按字数自动估算
  "items": [
    {
      "level": "lead",                <- 头条，每周只 1 条，可带 stats 关键数字卡
      "tag": "模型与产品发布",
      "heading": "小标题",
      "detail": "详细说明，2-4 句。",
      "comment": "一句点评（可选）",
      "stats": [ { "label": "指标名", "value": "数值" } ]
    },
    { "level": "key",   ... },        <- 重点，建议 3-4 条，写法同上
    { "level": "brief", ... }         <- 简讯，建议 6-10 条，只要 heading + 一句 detail
  ]
}

level 不写则默认为 key；若一条 lead 都没有，脚本会自动把第一条 key 提为 lead。
脚本会自动按 lead / key / brief 排序，并自动接续期号。
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

# ---- GitHub 部署设置 ----
REPO_URL = "https://github.com/zoonn-zero/web-page.git"
BRANCH = "main"
GIT_NAME = "zoonn-zero"
GIT_EMAIL = "zoonn-zero@users.noreply.github.com"


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


def jstr(value):
    """转成合法的 JS 字符串字面量（双引号、保留中文、自动转义）。"""
    return json.dumps(str(value), ensure_ascii=False)


LEVEL_ORDER = {"lead": 0, "key": 1, "brief": 2}


def normalize_items(raw_items):
    """规整条目：补齐 level、保证有且只有一条头条、按 lead/key/brief 排序。"""
    items = []
    for it in raw_items:
        lv = str(it.get("level") or "").strip().lower()
        if lv not in LEVEL_ORDER:
            lv = "key"
        item = dict(it)
        item["level"] = lv
        items.append(item)

    heads = [i for i in items if i["level"] == "lead"]
    if not heads:
        promoted = False
        for i in items:
            if i["level"] == "key":
                i["level"] = "lead"
                promoted = True
                break
        if not promoted and items:
            items[0]["level"] = "lead"
    elif len(heads) > 1:
        for extra in heads[1:]:
            extra["level"] = "key"

    items.sort(key=lambda i: LEVEL_ORDER[i["level"]])
    return items


def estimate_minutes(items):
    """按正文字数粗估阅读时间（中文约每分钟 450 字）。"""
    chars = 0
    for it in items:
        for key in ("heading", "detail", "comment"):
            chars += len(str(it.get(key) or ""))
    return max(1, round(chars / 450.0))


def to_js_entry(issue):
    """把一期周刊序列化成 data.js 里的 JS 对象字面量。"""
    lines = []
    for it in issue["items"]:
        fields = [
            "level: %s" % jstr(it["level"]),
            "tag: %s" % jstr(str(it.get("tag") or "").strip()),
            "heading: %s" % jstr(str(it.get("heading") or "").strip()),
            "detail: %s" % jstr(str(it.get("detail") or "").strip()),
        ]
        comment = str(it.get("comment") or "").strip()
        if comment:
            fields.append("comment: %s" % jstr(comment))

        stats = []
        for s in (it.get("stats") or []):
            label = str(s.get("label") or "").strip()
            value = str(s.get("value") or "").strip()
            if label or value:
                stats.append("{ label: %s, value: %s }" % (jstr(label), jstr(value)))
        if stats:
            fields.append("stats: [ %s ]" % ", ".join(stats))

        lines.append("      { " + ", ".join(fields) + " }")

    return (
        "  {\n"
        "    vol: %d,\n"
        "    date: %s,\n"
        "    headline: %s,\n"
        "    summary: %s,\n"
        "    minutes: %d,\n"
        "    items: [\n"
        "%s\n"
        "    ]\n"
        "  },"
    ) % (
        issue["vol"],
        jstr(issue["date"]),
        jstr(issue["headline"]),
        jstr(issue["summary"]),
        issue["minutes"],
        ",\n".join(lines),
    )


def next_vol_number(data_js_text):
    """扫描 weeklyIssues 里已有的 vol，算出下一期编号。"""
    block = re.search(r"const\s+weeklyIssues\s*=\s*\[(.*?)\n\];", data_js_text, re.S)
    scope = block.group(1) if block else data_js_text
    nums = [int(n) for n in re.findall(r"\bvol:\s*(\d+)", scope)]
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

    items = normalize_items(data.get("items") or [])
    if not items:
        die("content.json 里 items 为空，没有内容可发布。")

    if not os.path.exists(DATA_JS):
        die("找不到 data.js：" + DATA_JS)

    with open(DATA_JS, "r", encoding="utf-8", newline="") as f:
        original = f.read()

    # 保住原文件的换行符（本机是 CRLF），避免整文件 diff
    nl = "\r\n" if "\r\n" in original else "\n"

    # 定位 weeklyIssues 数组的起始位置（最新一期插在数组最前面）
    anchor = re.search(r"const\s+weeklyIssues\s*=\s*\[", original)
    if not anchor:
        die("data.js 里找不到 weeklyIssues 数组，格式可能被改动过。")
    insert_at = anchor.end()

    vol = next_vol_number(original)
    title = "AI 周刊 Vol.%02d" % vol
    date = (data.get("date") or "").strip()
    if not date:
        die("content.json 缺少 date 字段。")

    leads = [i for i in items if i["level"] == "lead"]
    headline = (
        (data.get("headline") or "").strip()
        or (str(leads[0].get("heading") or "").strip() if leads else "")
        or "本周 AI 快讯"
    )
    summary = (data.get("summary") or "").strip() or ("本周 AI 快讯，共 %d 条" % len(items))
    minutes = int(data.get("minutes") or estimate_minutes(items))

    issue = {
        "vol": vol,
        "date": date,
        "headline": headline,
        "summary": summary,
        "minutes": minutes,
        "items": items,
    }
    entry = to_js_entry(issue)
    updated = original[:insert_at] + ("\n" + entry).replace("\n", nl) + original[insert_at:]

    counts = {"lead": 0, "key": 0, "brief": 0}
    for it in items:
        counts[it["level"]] += 1

    # 生成预览
    print("=" * 56)
    print("即将发布：%s（%s）" % (title, date))
    print("主标题：%s" % headline)
    print(
        "层次：头条 %d / 重点 %d / 简讯 %d，共 %d 条，约 %d 分钟"
        % (counts["lead"], counts["key"], counts["brief"], len(items), minutes)
    )
    print("=" * 56)
    for it in items:
        print("  [%s] %s" % (it["level"], it.get("heading", "")))

    if dry_run:
        print("-" * 56)
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

    # ---- 与 GitHub 同步并推送 ----
    # 本机环境会定期清掉 .git 元数据、网络也偶发中断，所以每次运行都走
    # “检查/重建仓库 -> 拉远端 -> 只提交 js/data.js -> 推送”的自愈流程，
    # 不受本地其他改动影响，也不会覆盖你在 GitHub 上的其他文件。
    def git_works():
        r = subprocess.run(
            ["git", "rev-parse", "--git-dir"], cwd=ROOT, capture_output=True, text=True,
            env=dict(os.environ, GCM_INTERACTIVE="never", GIT_TERMINAL_PROMPT="0"),
        )
        return r.returncode == 0

    if not git_works():
        print("[2/3] 本地 git 仓库不可用，正在重建...")
        shutil.rmtree(os.path.join(ROOT, ".git"), ignore_errors=True)
        run_git(["init", "-b", BRANCH])
        run_git(["config", "user.name", GIT_NAME])
        run_git(["config", "user.email", GIT_EMAIL])

    if run_git(["remote", "get-url", "origin"], check=False).returncode == 0:
        run_git(["remote", "set-url", "origin", REPO_URL])
    else:
        run_git(["remote", "add", "origin", REPO_URL])

    # 取远端最新（网络失败会自动重试）
    run_git(["fetch", "origin", BRANCH], retries=5)
    # 本地分支指向远端提交：索引 = 远端内容，工作区文件保持不动
    run_git(["reset", "--mixed", "FETCH_HEAD"])

    # 只提交 data.js 这一个文件
    run_git(["add", "js/data.js"])
    diff = run_git(["diff", "--cached", "--quiet"], check=False)
    if diff.returncode == 0:
        print("[完成] data.js 与线上一致，无需提交。")
        return
    run_git(["commit", "-m", "%s（%s）" % (title, date)])
    run_git(["push", "origin", BRANCH], retries=5)
    sha = run_git(["rev-parse", "--short", "HEAD"]).stdout.strip()
    print("[3/3] 已推送到 GitHub（提交 %s）" % sha)
    print("[完成] %s 发布成功，GitHub Pages 约 1 分钟后自动更新。" % title)


if __name__ == "__main__":
    main()
