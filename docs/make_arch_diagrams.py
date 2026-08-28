"""Render the POLARIS architecture diagrams as PNGs for the project document."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

INK = "#1f2430"
MUTE = "#5b6472"
INDIGO = "#4f46e5"
INDIGO_SOFT = "#eef0fb"
LINE = "#c9cee0"
GREEN = "#0f766e"
GREEN_SOFT = "#e6f4f1"
AMBER = "#b45309"
AMBER_SOFT = "#fdf3e3"
GREY_SOFT = "#f4f5f9"


def box(ax, x, y, w, h, *, fill="#ffffff", edge=LINE, lw=1.1, r=0.018, z=2, dashed=False):
    p = FancyBboxPatch(
        (x, y), w, h,
        boxstyle=f"round,pad=0,rounding_size={r}",
        linewidth=lw, edgecolor=edge, facecolor=fill, zorder=z,
        linestyle=(0, (4, 3)) if dashed else "solid",
    )
    ax.add_patch(p)
    return p


def text(ax, x, y, s, *, size=8.2, color=INK, weight="normal", ha="center", va="center", style="normal", family=None):
    ax.text(x, y, s, fontsize=size, color=color, fontweight=weight, ha=ha, va=va,
            fontstyle=style, family=family, zorder=5)


def arrow(ax, p1, p2, *, color=INDIGO, lw=1.3, style="-|>", rad=0.0, ls="solid"):
    ax.add_patch(FancyArrowPatch(
        p1, p2, arrowstyle=style, mutation_scale=11, linewidth=lw,
        color=color, zorder=4, linestyle=ls,
        connectionstyle=f"arc3,rad={rad}", shrinkA=2, shrinkB=2,
    ))


def canvas(w_in, h_in):
    fig = plt.figure(figsize=(w_in, h_in), dpi=220)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis("off")
    fig.patch.set_facecolor("white")
    return fig, ax


# ---------------------------------------------------------------- diagram 1
def system_diagram(path):
    fig, ax = canvas(9.0, 5.4)

    # ---- client column
    box(ax, 0.022, 0.10, 0.212, 0.80, fill="#ffffff", edge=INDIGO, lw=1.4)
    text(ax, 0.128, 0.855, "BROWSER", size=7.4, color=INDIGO, weight="bold")
    text(ax, 0.128, 0.815, "TanStack Start · React 19 · Tailwind v4", size=6.6, color=MUTE)

    client_rows = [
        ("PolicyForm", "policy text + domain hint"),
        ("Dashboard views", "KPIs · India map · model card"),
        ("Agents · Debate · Network", "qualitative panels"),
        ("A/B Compare", "two lever sets"),
        ("Reports · Settings", "history · keys · theme"),
    ]
    y = 0.715
    for title, sub in client_rows:
        box(ax, 0.040, y - 0.052, 0.176, 0.078, fill=GREY_SOFT, edge=LINE, lw=0.9)
        text(ax, 0.128, y, title, size=7.1, weight="bold")
        text(ax, 0.128, y - 0.031, sub, size=6.2, color=MUTE)
        y -= 0.106

    box(ax, 0.040, 0.125, 0.176, 0.058, fill=INDIGO_SOFT, edge=INDIGO, lw=0.9, dashed=True)
    text(ax, 0.128, 0.167, "localStorage (this device only)", size=6.0, weight="bold", color=INDIGO)
    text(ax, 0.128, 0.142, "Groq key · owner passcode · theme", size=5.8, color=MUTE)

    # ---- transport
    text(ax, 0.322, 0.845, "JSON over HTTP", size=7.0, color=INDIGO, weight="bold")
    calls = [
        ("POST /api/runs", "x-groq-key  →  run_id", 0.755, "right"),
        ("GET /api/runs/{id}", "poll ~1.5 s until terminal", 0.615, "left"),
        ("POST /api/model/compare", "synchronous · no LLM", 0.475, "right"),
        ("GET · DELETE /api/runs", "x-admin-key (owner)", 0.335, "right"),
    ]
    for label, sub, yy, direction in calls:
        if direction == "right":
            arrow(ax, (0.240, yy), (0.404, yy))
        else:
            arrow(ax, (0.404, yy), (0.240, yy))
        text(ax, 0.322, yy + 0.030, label, size=6.8, weight="bold")
        text(ax, 0.322, yy - 0.028, sub, size=6.2, color=MUTE)

    # ---- backend column
    box(ax, 0.408, 0.10, 0.318, 0.80, fill="#ffffff", edge=INDIGO, lw=1.4)
    text(ax, 0.567, 0.855, "FASTAPI BACKEND", size=7.4, color=INDIGO, weight="bold")
    text(ax, 0.567, 0.815, "all analysis happens here", size=6.6, color=MUTE)

    box(ax, 0.426, 0.700, 0.282, 0.082, fill=INDIGO_SOFT, edge=INDIGO, lw=1.0)
    text(ax, 0.567, 0.757, "main.py — routes · CORS · owner gate", size=7.0, weight="bold")
    text(ax, 0.567, 0.723, "persists a pending run, schedules a background task", size=6.1, color=MUTE)

    box(ax, 0.426, 0.300, 0.282, 0.372, fill=GREY_SOFT, edge=LINE, lw=1.0)
    text(ax, 0.567, 0.645, "pipeline.py — nine-stage orchestrator", size=7.0, weight="bold")
    text(ax, 0.567, 0.615, "patches the stored payload after every stage", size=6.1, color=MUTE)

    mods = [
        ("domain_registry.py", "supported vs qualitative-only", GREEN, GREEN_SOFT),
        ("ev_model.py", "TWFE/DiD calibration + projection", GREEN, GREEN_SOFT),
        ("worldbank.py + state_seed_data.json", "macro indicators + per-state covariates", GREEN, GREEN_SOFT),
        ("groq_client.py + prompts.py", "parse · analyse · risk · debate · synthesise", AMBER, AMBER_SOFT),
    ]
    yy = 0.556
    for title, sub, ec, fc in mods:
        box(ax, 0.440, yy - 0.030, 0.254, 0.064, fill=fc, edge=ec, lw=0.9)
        text(ax, 0.567, yy + 0.011, title, size=6.6, weight="bold")
        text(ax, 0.567, yy - 0.014, sub, size=5.9, color=MUTE)
        yy -= 0.076

    box(ax, 0.426, 0.135, 0.282, 0.140, fill="#ffffff", edge=LINE, lw=1.0)
    text(ax, 0.567, 0.245, "db.py — SQLite", size=7.0, weight="bold")
    text(ax, 0.567, 0.212, "runs(run_id, payload JSON, timestamps)", size=6.0, color=MUTE, family="monospace")
    text(ax, 0.567, 0.187, "model_predictions(run_id, state, effect, CI)", size=6.0, color=MUTE, family="monospace")
    text(ax, 0.567, 0.156, "the payload IS the API response", size=6.0, color=INDIGO, style="italic")

    arrow(ax, (0.567, 0.700), (0.567, 0.674), lw=1.1)
    arrow(ax, (0.567, 0.300), (0.567, 0.277), lw=1.1)

    # ---- external column
    box(ax, 0.744, 0.10, 0.234, 0.80, fill="#ffffff", edge=LINE, lw=1.2, dashed=True)
    text(ax, 0.861, 0.855, "EXTERNAL", size=7.4, color=MUTE, weight="bold")
    text(ax, 0.861, 0.815, "reached at run time", size=6.6, color=MUTE)

    box(ax, 0.766, 0.610, 0.190, 0.140, fill=AMBER_SOFT, edge=AMBER, lw=1.0)
    text(ax, 0.861, 0.717, "Groq API", size=7.6, weight="bold", color=AMBER)
    text(ax, 0.861, 0.688, "openai/gpt-oss-120b", size=6.4, color=MUTE, family="monospace")
    text(ax, 0.861, 0.660, "reasoning layer only —", size=6.3, color=MUTE)
    text(ax, 0.861, 0.638, "never the source of numbers", size=6.3, color=MUTE)

    box(ax, 0.766, 0.430, 0.190, 0.125, fill=GREEN_SOFT, edge=GREEN, lw=1.0)
    text(ax, 0.861, 0.522, "World Bank Open Data", size=7.2, weight="bold", color=GREEN)
    text(ax, 0.861, 0.492, "GDP · inflation · CO₂", size=6.4, color=MUTE)
    text(ax, 0.861, 0.468, "unemployment · renewables", size=6.4, color=MUTE)
    text(ax, 0.861, 0.444, "fetched per run for context", size=6.2, color=MUTE, style="italic")

    box(ax, 0.766, 0.255, 0.190, 0.125, fill=GREEN_SOFT, edge=GREEN, lw=1.0)
    text(ax, 0.861, 0.347, "EV panel + seed data", size=7.2, weight="bold", color=GREEN)
    text(ax, 0.861, 0.317, "state × year penetration", size=6.4, color=MUTE)
    text(ax, 0.861, 0.293, "GSDP · urbanisation · charging", size=6.4, color=MUTE)
    text(ax, 0.861, 0.269, "bundled in the repo", size=6.2, color=MUTE, style="italic")

    arrow(ax, (0.732, 0.680), (0.764, 0.680), color=AMBER)
    arrow(ax, (0.732, 0.492), (0.764, 0.492), color=GREEN)
    arrow(ax, (0.732, 0.318), (0.764, 0.318), color=GREEN)

    text(ax, 0.861, 0.175, "No user accounts. The owner passcode\nand each visitor's Groq key are the only\ncredentials, and neither is stored\nin a run payload.",
         size=6.3, color=MUTE, va="center")

    fig.savefig(path, facecolor="white")
    plt.close(fig)
    print("wrote", path)


# ---------------------------------------------------------------- diagram 2
def pipeline_diagram(path):
    fig, ax = canvas(9.0, 2.75)

    stages = [
        ("1", "parse", "policy →\ndomain, goals,\nsectors, levers", True),
        ("2", "classify", "supported\ndomain? which\nmodel?", False),
        ("3", "model", "TWFE/DiD fit\n+ policy\nprojection", False),
        ("4", "fetch_data", "World Bank +\nper-state\ncovariates", False),
        ("5", "analyze", "economic ·\nenvironment ·\nsocial", True),
        ("6", "risk", "implementation\n+ outcome\nrisk", True),
        ("7", "debate", "only on\nconflict:\n2 rounds", None),
        ("8", "synthesize", "verdict ·\nscore ·\ntop effects", True),
        ("9", "heatmap", "per-state\nintensity, then\ncomplete", False),
    ]

    x0, w, gap = 0.022, 0.093, 0.0155
    y, h = 0.395, 0.375
    for i, (num, name, sub, llm) in enumerate(stages):
        x = x0 + i * (w + gap)
        if llm is True:
            fc, ec, tagtxt, tagcol = AMBER_SOFT, AMBER, "LLM", AMBER
        elif llm is None:
            fc, ec, tagtxt, tagcol = INDIGO_SOFT, INDIGO, "conditional", INDIGO
        else:
            fc, ec, tagtxt, tagcol = GREEN_SOFT, GREEN, "deterministic", GREEN
        box(ax, x, y, w, h, fill=fc, edge=ec, lw=1.1)
        text(ax, x + w / 2, y + h - 0.055, num, size=7.0, color=tagcol, weight="bold")
        text(ax, x + w / 2, y + h - 0.125, name, size=7.6, weight="bold", family="monospace")
        ax.text(x + w / 2, y + 0.105, sub, fontsize=5.3, color=MUTE, ha="center", va="top",
                linespacing=1.45, zorder=5)
        text(ax, x + w / 2, y - 0.055, tagtxt, size=5.8, color=tagcol, weight="bold")
        if i < len(stages) - 1:
            arrow(ax, (x + w, y + h / 2), (x + w + gap, y + h / 2), color=LINE, lw=1.0)

    text(ax, 0.5, 0.945, "Per-run pipeline — every stage patches the stored payload, so the UI shows live progress",
         size=7.6, weight="bold")
    text(ax, 0.5, 0.875, "pipeline.py  ·  runs as a FastAPI background task; the frontend polls GET /api/runs/{id} throughout",
         size=6.6, color=MUTE)

    text(ax, 0.5, 0.185, "Groq failures at stages 5–7 degrade gracefully (the run continues); a failure at parse or synthesize fails the run with a clear message.",
         size=6.4, color=MUTE)
    text(ax, 0.5, 0.085, "Stage 3 is skipped for unsupported domains — POLARIS then reports a qualitative analysis and no per-state numbers at all.",
         size=6.4, color=INDIGO, style="italic")

    fig.savefig(path, facecolor="white")
    plt.close(fig)
    print("wrote", path)


if __name__ == "__main__":
    system_diagram("/sessions/nifty-hopeful-rubin/mnt/outputs/arch-system.png")
    pipeline_diagram("/sessions/nifty-hopeful-rubin/mnt/outputs/arch-pipeline.png")
