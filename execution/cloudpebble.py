#!/usr/bin/env python3
"""Simulate CloudPebble's GitHub import and build for a Pebble project directory.

CloudPebble (coredevices/cloudpebble @ 08298a2, ide/utils/project.py, ide/tasks/archive.py,
ide/models/files.py, ide/utils/sdk/sdk_scripts.py, ide/static/ide/js/project_list.js):
- takes the first package.json with a "pebble" section,
- imports only .c/.h under src/c and .js/.json under src/pkjs (anything else is silently dropped),
- replaces the project's wscript with its own (below), so no -D defines from ours reach the build,
- defaults an empty import branch to 'master' (our repos use main: put the branch in the link).
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

# CloudPebble's generated wscript for native SDK 3 projects with modern multi-JS
# (jshint off, pkjs entry index.js), copied verbatim from generate_wscript_file_sdk3.
CLOUDPEBBLE_WSCRIPT = r"""#
# This file is the default set of rules to compile a Pebble project.
#
# Feel free to customize this to your needs.
#

import os.path
try:
    from sh import CommandNotFound, jshint, cat, ErrorReturnCode_2
    hint = jshint
except (ImportError, Exception):
    hint = None

top = '.'
out = 'build'


def options(ctx):
    ctx.load('pebble_sdk')


def configure(ctx):
    ctx.load('pebble_sdk')


def build(ctx):
    if False and hint is not None:
        try:
            hint(['--config', 'pebble-jshintrc'] + [node.abspath() for node in ctx.path.ant_glob("src/**/*.js")], _tty_out=False) # no tty because there are none in the cloudpebble sandbox.
        except ErrorReturnCode_2 as e:
            ctx.fatal("\\nJavaScript linting failed (you can disable this in Project Settings):\\n" + e.stdout)

    ctx.load('pebble_sdk')

    build_worker = os.path.exists('worker_src')
    binaries = []

    for p in ctx.env.TARGET_PLATFORMS:
        ctx.set_env(ctx.all_envs[p])
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        ctx.pbl_program(source=ctx.path.ant_glob('src/c/**/*.c'), target=app_elf)

        if build_worker:
            worker_elf = '{}/pebble-worker.elf'.format(ctx.env.BUILD_DIR)
            binaries.append({'platform': p, 'app_elf': app_elf, 'worker_elf': worker_elf})
            ctx.pbl_worker(source=ctx.path.ant_glob('worker_src/c/**/*.c'), target=worker_elf)
        else:
            binaries.append({'platform': p, 'app_elf': app_elf})

    ctx(features='subst',
        source='package.json',
        target='js/package.json',
        is_copy=True)

    ctx.set_group('bundle')
    ctx.pbl_bundle(binaries=binaries, js=ctx.path.ant_glob(['src/pkjs/**/*.js', 'src/pkjs/**/*.json']), js_entry_file='src/pkjs/index.js')
"""


def accepted(rel: str) -> bool:
    return ((rel.startswith('src/pkjs/') and rel.endswith(('.js', '.json')))
            or (rel.startswith('src/c/') and rel.endswith(('.c', '.h'))))


def simulate(project: Path, out: Path) -> tuple[Path, list[str]]:
    """Copy what CloudPebble would import into `out`, build it, return (pbw, dropped files)."""
    shutil.rmtree(out, ignore_errors=True)
    out.mkdir(parents=True)
    shutil.copy(project / 'package.json', out / 'package.json')
    if (project / 'package-lock.json').exists():
        shutil.copy(project / 'package-lock.json', out / 'package-lock.json')
    dropped = []
    for path in sorted((project / 'src').rglob('*')):
        if not path.is_file():
            continue
        rel = path.relative_to(project).as_posix()
        if not accepted(rel):
            dropped.append(rel)
            continue
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(path, out / rel)
    (out / 'wscript').write_text(CLOUDPEBBLE_WSCRIPT)
    subprocess.run(['npm', 'install', '--silent', '--no-audit', '--no-fund'], cwd=out, check=True)
    env = {k: v for k, v in os.environ.items() if not k.startswith('FH_')}
    result = subprocess.run(['pebble', 'build'], cwd=out, env=env, capture_output=True, text=True)
    (out / 'build.log').write_text(result.stdout + result.stderr)
    result.check_returncode()
    return next((out / 'build').glob('*.pbw')), dropped


if __name__ == '__main__':
    if '--dry-run' in sys.argv:
        print('Dry run: cloudpebble.py simulation ready')
        sys.exit(0)
    pbw, dropped = simulate(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
    print(f'built {pbw}; dropped: {dropped or "none"}')
    sys.exit(1 if dropped else 0)
