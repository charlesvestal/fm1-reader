#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-only
"""Print what an FM-1 firmware announces for a screen reader (firmware/announce.c; PROTOCOL.md): the screen's
text as it is sent (the page puts it in words with the firmware's words file).
   fm1_reader.py [--where] [--seconds N]     needs mido + python-rtmidi"""
import argparse, sys, time
import mido

H = [0x7D, 0x53, 0x52]
ap = argparse.ArgumentParser()
ap.add_argument("--where", action="store_true", help="ask for the whole screen once")
ap.add_argument("--seconds", type=float, default=0, help="stop after N seconds (0: run until ^C)")
a = ap.parse_args()
name = next((n for n in mido.get_output_names() if "FM-1" in n or "X0X" in n), None)
if not name:
    sys.exit("no FM-1 port")
inp = mido.open_input(next(n for n in mido.get_input_names() if n.split(":")[0] == name.split(":")[0]))
out = mido.open_output(name)
t0 = last = 0.0
where_at, said = 0, False
t0 = time.time()
while not a.seconds or time.time() - t0 < a.seconds:
    if time.time() - last > 2:
        out.send(mido.Message("sysex", data=H + [1, 1]))
        last = time.time()
    for m in inp.iter_pending():
        d = list(m.data) if m.type == "sysex" else []
        if d[:3] == H and len(d) > 4:
            text = bytes(d[5:]).decode("ascii", "replace")
            if d[3] == 1:
                name, _, words = text.partition("\0")
                print(f"hello: {name}  (words: {words or 'none'})", flush=True)
                if a.where and not where_at:     # asked once it has answered (it takes one SysEx at a time),
                    where_at = time.time() + 0.4  # and only if it didn't send the screen by itself
            else:
                said = True
                print("said%s: %s" % ("!" if d[4] & 1 else "", text), flush=True)
    if where_at and time.time() > where_at:
        if not said:
            out.send(mido.Message("sysex", data=H + [3]))
        where_at, a.where = 0, False
    time.sleep(0.01)
out.send(mido.Message("sysex", data=H + [2]))
