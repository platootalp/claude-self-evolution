# /evolve-report: Future Feature

## Overview

A future `/evolve-report` command that generates Markdown reports summarizing the plugin's auto-improvement activity.

## Proposed Features

- Decision distribution chart (ASCII pie chart or bar chart)
- Skill quality trends over a 7-day rolling window
- Performance metrics dashboard (review duration, spawn failure rate)
- Anomaly event summaries (security blocks, write failures)
- Session-by-session breakdown with drill-down links

## Dependencies

- Requires the observability infrastructure (per-session logging, stats.json) to be in place
- Requires sufficient log data to produce meaningful reports

## Status

Planned. No implementation yet.
