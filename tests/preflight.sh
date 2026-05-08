#!/usr/bin/env bash
# tests/preflight.sh — 环境前置自检；输出 JSON 到 stdout，exit 0 表示全部通过。
#
# F32: 不依赖 bash 4+ 数组语法（macOS 默认 bash 3.2 也能跑），避免"自检脚本本身需要被自检的环境"
# 的自举悖论。所有累积写入临时文件 + jq --slurpfile 汇总。
set -uo pipefail   # 故意不用 -e：单项失败也要继续检完所有项

# 早退用 case 模式匹配，纯 POSIX；任何 bash 1.x+ 都能解析
case "${BASH_VERSION:-0}" in
    [01].*|2.*|3.0*|3.1*)
        echo '{"ok":false,"reason":"bash too old (need >= 3.2)","detected":"'"${BASH_VERSION:-unknown}"'"}'
        exit 1
        ;;
esac

PASS=0; FAIL=0
RESULTS_TMP="$(mktemp -t preflight-XXXXXX)"
trap 'rm -f "$RESULTS_TMP"' EXIT

check() {
    id="$1"; desc="$2"; cmd="$3"; want="$4"
    out=$(eval "$cmd" 2>&1) ; exit_code=$?
    ok="false"
    if [ "$exit_code" -eq 0 ] && { [ -z "$want" ] || echo "$out" | grep -qE "$want"; }; then
        ok="true"; PASS=$((PASS+1))
    else
        FAIL=$((FAIL+1))
    fi
    jq -nc --arg id "$id" --arg d "$desc" --arg ok "$ok" --arg out "$out" '{id:$id, desc:$d, pass:($ok=="true"), output:$out}' >> "$RESULTS_TMP"
}

check E1 "jq >= 1.6"          "jq --version"                                    'jq-1\.[6-9]|jq-[2-9]'
check E2 "bash >= 4.x"        "bash --version | head -1"                         'version (4|5|6)\.'
check E3 "awk works"          "awk 'BEGIN{print 1}'"                             '^1$'
check E4 "claude available"   "command -v claude >/dev/null && echo OK"          '^OK$'
check E5 "git >= 2.x"         "git --version"                                    'git version (2|3)\.'
check E6 "REPO_ROOT writable" 'REPO_ROOT="$(git rev-parse --show-toplevel)" && touch "$REPO_ROOT/.write-test" && rm "$REPO_ROOT/.write-test" && echo OK' '^OK$'
check E7 "~/.claude/skills/ writable" 'mkdir -p "$HOME/.claude/skills" && touch "$HOME/.claude/skills/.write-test" && rm "$HOME/.claude/skills/.write-test" && echo OK' '^OK$'
check E8 "python3 (perf timestamp)" "python3 -c 'import time; print(int(time.time()*1000))'" '^[0-9]+$'

# --slurpfile 把 JSONL 文件读成 JSON 数组；不依赖 bash 数组
jq -n --slurpfile r "$RESULTS_TMP" --argjson p "$PASS" --argjson f "$FAIL" '{pass:$p, fail:$f, results:$r, ok:($f==0)}'

[ "$FAIL" -eq 0 ]
