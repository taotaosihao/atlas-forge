"""Bound an isolated test command and reap its process group on every exit."""

import os
import signal
import subprocess
import sys

proc = None
interrupted = None


def handle_signal(number, _frame):
    global interrupted
    interrupted = number
    if proc is not None:
        raise SystemExit(128 + number)


for number in (signal.SIGINT, signal.SIGTERM):
    signal.signal(number, handle_signal)

try:
    proc = subprocess.Popen(sys.argv[2:], start_new_session=True)
    if interrupted is not None:
        raise SystemExit(128 + interrupted)
    try:
        status = proc.wait(timeout=float(sys.argv[1]))
    except subprocess.TimeoutExpired:
        status = 124
finally:
    # A second cancellation must not interrupt cleanup; descendants can outlive
    # an already-exited group leader, so do not guard killpg with proc.poll().
    for number in (signal.SIGINT, signal.SIGTERM):
        signal.signal(number, signal.SIG_IGN)
    if proc is not None:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        proc.wait()

raise SystemExit(status if status >= 0 else 128 - status)
