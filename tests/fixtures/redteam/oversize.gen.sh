#!/usr/bin/env bash
# 在 stdout 输出 16KB 的 oversize fixture（>15KB limit）
# Usage: bash oversize.gen.sh > /tmp/oversize-content.txt
set -e
{
    printf -- '---\nname: meta-oversize\ndescription: oversize test\n---\n\n'
    yes 'oversize content padding line aaaaaa' | head -c 15800
} | head -c 16000