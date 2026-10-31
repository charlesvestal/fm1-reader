#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Print what an FM-1 firmware announces for a screen reader (firmware/announce.c; PROTOCOL.md): the screen's
text as it is sent (the page puts it in words with the firmware's words file).
   fm1_reader.py [--where] [--seconds N] [--port NAME]     needs mido + python-rtmidi
The FM-1 is found as the page finds it: every port is asked (HELLO) and the one that answers is it, whatever its
name ("FM-1", "X0X", "Felucca", ...). --port picks one by (part of) its name instead."""
import argparse, re, sys, time
import mido

H = [0x7D, 0x53, 0x52]
ap = argparse.ArgumentParser()
ap.add_argument("--where", action="store_true", help="ask for the whole screen once")
ap.add_argument("--seconds", type=float, default=0, help="stop after N seconds (0: run until ^C)")
ap.add_argument("--port", help="the FM-1's MIDI port (part of its name), instead of asking every port")
a = ap.parse_args()


def opened(names, open_port):
    ports = {}
    for n in names:
        try:
            ports[n] = open_port(n)
        except Exception:                    # (a port another program holds: python-rtmidi's errors are not OSError)
            pass
    return ports


def device(name):
    """a port's device: ALSA's client ("FM-1:FM-1 MIDI 1 20:0"), without the number Windows puts after each port"""
    return re.sub(r"\s+\d+$", "", name.split(":")[0])


def find():
    """the (input, output) of the FM-1: the input a HELLO answer comes in on, and the output of the same device"""
    outs = [n for n in mido.get_output_names() if not a.port or a.port in n]
    ins = opened([n for n in mido.get_input_names() if not a.port or a.port in n], mido.open_input)
    outp = opened(outs, mido.open_output)
    try:
        for _ in range(3):                    # three HELLOs, as the page sends: other gear ignores them
            for o in outp.values():
                o.send(mido.Message("sysex", data=H + [1, 1]))
            t = time.time()
            while time.time() - t < 0.5:
                for n, i in ins.items():
                    for m in i.iter_pending():
                        # an answer has a name: a loopback (macOS's IAC bus) sends the HELLO back without one
                        if m.type == "sysex" and list(m.data[:4]) == H + [1] and bytes(m.data[5:]).split(b"\0")[0]:
                            o = next((k for k in outp if device(k) == device(n)), None)
                            if o:
                                return n, o
                time.sleep(0.01)
        return None, None
    finally:
        for p in list(ins.values()) + list(outp.values()):
            p.close()


in_name, out_name = find()
if not in_name:
    sys.exit("no FM-1 answered: plug it in; its firmware needs screen reader support" +
             ("" if a.port else " (or name its port: --port)"))
inp = mido.open_input(in_name)
out = mido.open_output(out_name)
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
                print("said%s%s: %s" % ("!" if d[4] & 1 else "", " (warning)" if d[4] & 2 else "", text), flush=True)
    if where_at and time.time() > where_at:
        if not said:
            out.send(mido.Message("sysex", data=H + [3]))
        where_at, a.where = 0, False
    time.sleep(0.01)
out.send(mido.Message("sysex", data=H + [2]))
