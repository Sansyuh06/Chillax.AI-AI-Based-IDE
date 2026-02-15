"""
Chillax.AI — Animated Code Graph Visualization
Pygame animation inspired by learngitbranching.js.org

Demonstrates how Chillax.AI scans a Python codebase and builds
a visual graph of modules, functions, imports, and call relationships.

Style: Premium dark mode, smooth eased animations, glow effects,
       particle trails, and interactive hover states.

Run:  python visualization.py
"""

import pygame
import math
import random
import sys
import time as time_module

# ===================================================================
# CONFIGURATION
# ===================================================================

WIDTH, HEIGHT = 1280, 800
FPS = 60

# Premium dark palette (not pure black — uses #121212 base)
COLORS = {
    "bg": (18, 18, 18),               # #121212
    "surface": (30, 30, 36),           # cards / panels
    "border": (48, 54, 61),            # subtle borders
    "text": (230, 237, 243),           # primary text
    "text_dim": (110, 118, 129),       # muted text
    "blue": (88, 166, 255),            # primary accent
    "purple": (188, 140, 255),         # secondary accent
    "green": (63, 185, 80),            # success
    "orange": (210, 153, 34),          # warning / folder
    "red": (248, 81, 73),              # error
    "cyan": (57, 210, 192),            # code highlight
    "pink": (247, 120, 186),           # special
    "glow_blue": (88, 166, 255, 40),   # glow effect
    "edge": (88, 166, 255, 100),       # edge color
}

# Node types with their colors
NODE_COLORS = {
    "module": COLORS["blue"],
    "function": COLORS["purple"],
    "class": COLORS["orange"],
    "import": COLORS["cyan"],
    "call": COLORS["green"],
}


# ===================================================================
# EASING FUNCTIONS
# ===================================================================

def ease_out_cubic(t):
    return 1 - (1 - t) ** 3

def ease_out_elastic(t):
    if t == 0 or t == 1:
        return t
    p = 0.3
    return math.pow(2, -10 * t) * math.sin((t - p / 4) * (2 * math.pi) / p) + 1

def ease_in_out_quad(t):
    if t < 0.5:
        return 2 * t * t
    return 1 - (-2 * t + 2) ** 2 / 2

def ease_out_back(t):
    c1 = 1.70158
    c3 = c1 + 1
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2

def lerp(a, b, t):
    return a + (b - a) * t

def lerp_color(c1, c2, t):
    return tuple(int(lerp(a, b, t)) for a, b in zip(c1, c2))


# ===================================================================
# PARTICLE SYSTEM
# ===================================================================

class Particle:
    def __init__(self, x, y, color, velocity=None, lifetime=1.0, size=3):
        self.x = x
        self.y = y
        self.color = color
        self.vx = velocity[0] if velocity else random.uniform(-1.5, 1.5)
        self.vy = velocity[1] if velocity else random.uniform(-1.5, 1.5)
        self.lifetime = lifetime
        self.max_lifetime = lifetime
        self.size = size
        self.alive = True

    def update(self, dt):
        self.x += self.vx * dt * 60
        self.y += self.vy * dt * 60
        self.lifetime -= dt
        if self.lifetime <= 0:
            self.alive = False

    def draw(self, surface):
        if not self.alive:
            return
        alpha = max(0, self.lifetime / self.max_lifetime)
        r, g, b = self.color[:3]
        size = max(1, int(self.size * alpha))
        # Draw with transparency via a small surface
        s = pygame.Surface((size * 2, size * 2), pygame.SRCALPHA)
        pygame.draw.circle(s, (r, g, b, int(255 * alpha * 0.7)), (size, size), size)
        surface.blit(s, (int(self.x) - size, int(self.y) - size))


class ParticleSystem:
    def __init__(self):
        self.particles = []

    def emit(self, x, y, color, count=5, spread=2.0, lifetime=0.8, size=3):
        for _ in range(count):
            v = (random.uniform(-spread, spread), random.uniform(-spread, spread))
            self.particles.append(Particle(x, y, color, v, lifetime, size))

    def emit_trail(self, x1, y1, x2, y2, color, count=10, lifetime=0.5):
        for i in range(count):
            t = i / max(1, count - 1)
            x = lerp(x1, x2, t)
            y = lerp(y1, y2, t)
            self.particles.append(Particle(
                x + random.uniform(-3, 3),
                y + random.uniform(-3, 3),
                color, (0, 0), lifetime + random.uniform(0, 0.3), 2
            ))

    def update(self, dt):
        self.particles = [p for p in self.particles if p.alive]
        for p in self.particles:
            p.update(dt)

    def draw(self, surface):
        for p in self.particles:
            p.draw(surface)


# ===================================================================
# ANIMATED NODE
# ===================================================================

class AnimatedNode:
    def __init__(self, node_id, label, node_type, target_x, target_y,
                 delay=0, radius=28):
        self.id = node_id
        self.label = label
        self.node_type = node_type
        self.color = NODE_COLORS.get(node_type, COLORS["blue"])
        self.target_x = target_x
        self.target_y = target_y
        self.x = target_x
        self.y = target_y - 80  # start above
        self.radius = radius
        self.target_radius = radius
        self.current_radius = 0  # animate in
        self.delay = delay
        self.anim_time = 0
        self.anim_duration = 0.7
        self.visible = False
        self.hover = False
        self.pulse = 0
        self.scale = 0
        self.opacity = 0

    def start(self):
        self.visible = True
        self.anim_time = 0

    def update(self, dt, mouse_pos):
        if not self.visible:
            return

        self.anim_time += dt
        t = min(1, self.anim_time / self.anim_duration)

        # Position animation
        eased = ease_out_back(t)
        self.x = lerp(self.target_x, self.target_x, eased)
        self.y = lerp(self.target_y - 80, self.target_y, eased)

        # Scale animation
        self.scale = ease_out_elastic(t)
        self.current_radius = self.target_radius * self.scale
        self.opacity = min(1, t * 2)

        # Hover detection
        dx = mouse_pos[0] - self.x
        dy = mouse_pos[1] - self.y
        self.hover = (dx * dx + dy * dy) <= (self.current_radius + 5) ** 2

        # Pulse
        self.pulse += dt * 2
        if self.pulse > math.pi * 2:
            self.pulse -= math.pi * 2

    def draw(self, surface, font_small, font_label):
        if not self.visible or self.opacity < 0.01:
            return

        r = max(1, int(self.current_radius))
        x, y = int(self.x), int(self.y)

        # Glow effect
        if self.hover or self.anim_time < 1.0:
            glow_r = r + 12 + int(math.sin(self.pulse) * 3)
            glow_surf = pygame.Surface((glow_r * 2, glow_r * 2), pygame.SRCALPHA)
            glow_alpha = int(40 * self.opacity)
            if self.hover:
                glow_alpha = 60
            pygame.draw.circle(glow_surf, (*self.color, glow_alpha), (glow_r, glow_r), glow_r)
            surface.blit(glow_surf, (x - glow_r, y - glow_r))

        # Outer ring
        ring_r = r + 3
        ring_alpha = int(120 * self.opacity)
        ring_surf = pygame.Surface((ring_r * 2 + 4, ring_r * 2 + 4), pygame.SRCALPHA)
        pygame.draw.circle(ring_surf, (*self.color, ring_alpha),
                           (ring_r + 2, ring_r + 2), ring_r + 2, 2)
        surface.blit(ring_surf, (x - ring_r - 2, y - ring_r - 2))

        # Main circle
        main_surf = pygame.Surface((r * 2 + 2, r * 2 + 2), pygame.SRCALPHA)
        fill_color = lerp_color(COLORS["surface"], self.color, 0.25 if not self.hover else 0.5)
        fill_alpha = int(220 * self.opacity)
        pygame.draw.circle(main_surf, (*fill_color, fill_alpha), (r + 1, r + 1), r)
        # Border
        border_color = self.color if self.hover else lerp_color(self.color, COLORS["border"], 0.3)
        pygame.draw.circle(main_surf, (*border_color, int(255 * self.opacity)),
                           (r + 1, r + 1), r, 2)
        surface.blit(main_surf, (x - r - 1, y - r - 1))

        # Type icon (small letter inside)
        icon_map = {"module": "M", "function": "ƒ", "class": "C", "import": "→", "call": "( )"}
        icon_text = icon_map.get(self.node_type, "?")
        icon_surf = font_small.render(icon_text, True, self.color)
        icon_rect = icon_surf.get_rect(center=(x, y - 2))
        # Apply opacity
        icon_alpha = pygame.Surface(icon_surf.get_size(), pygame.SRCALPHA)
        icon_alpha.blit(icon_surf, (0, 0))
        icon_alpha.set_alpha(int(255 * self.opacity))
        surface.blit(icon_alpha, icon_rect)

        # Label below
        label_surf = font_label.render(self.label, True, COLORS["text"])
        label_rect = label_surf.get_rect(center=(x, y + r + 16))
        label_alpha_surf = pygame.Surface(label_surf.get_size(), pygame.SRCALPHA)
        label_alpha_surf.blit(label_surf, (0, 0))
        label_alpha_surf.set_alpha(int(220 * self.opacity))
        surface.blit(label_alpha_surf, label_rect)

        # Type label (smaller, dimmer)
        type_surf = font_small.render(self.node_type, True, COLORS["text_dim"])
        type_rect = type_surf.get_rect(center=(x, y + r + 32))
        type_alpha_surf = pygame.Surface(type_surf.get_size(), pygame.SRCALPHA)
        type_alpha_surf.blit(type_surf, (0, 0))
        type_alpha_surf.set_alpha(int(150 * self.opacity))
        surface.blit(type_alpha_surf, type_rect)


# ===================================================================
# ANIMATED EDGE
# ===================================================================

class AnimatedEdge:
    def __init__(self, source, target, label="", delay=0, color=None):
        self.source = source
        self.target = target
        self.label = label
        self.color = color or COLORS["blue"]
        self.delay = delay
        self.anim_time = 0
        self.anim_duration = 0.6
        self.visible = False
        self.progress = 0

    def start(self):
        self.visible = True
        self.anim_time = 0

    def update(self, dt):
        if not self.visible:
            return
        self.anim_time += dt
        t = min(1, self.anim_time / self.anim_duration)
        self.progress = ease_out_cubic(t)

    def draw(self, surface, font_small, particles):
        if not self.visible or self.progress < 0.01:
            return

        sx, sy = self.source.x, self.source.y
        tx, ty = self.target.x, self.target.y

        # Current end point (animated)
        cx = lerp(sx, tx, self.progress)
        cy = lerp(sy, ty, self.progress)

        # Draw line with alpha
        line_surf = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        alpha = int(180 * min(1, self.progress * 2))
        pygame.draw.line(line_surf, (*self.color, alpha),
                         (int(sx), int(sy)), (int(cx), int(cy)), 2)
        surface.blit(line_surf, (0, 0))

        # Arrowhead at current end
        if self.progress > 0.3:
            angle = math.atan2(ty - sy, tx - sx)
            arrow_len = 10
            arr_x1 = cx - arrow_len * math.cos(angle - 0.4)
            arr_y1 = cy - arrow_len * math.sin(angle - 0.4)
            arr_x2 = cx - arrow_len * math.cos(angle + 0.4)
            arr_y2 = cy - arrow_len * math.sin(angle + 0.4)
            arrow_surf = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
            pygame.draw.polygon(arrow_surf, (*self.color, alpha), [
                (int(cx), int(cy)),
                (int(arr_x1), int(arr_y1)),
                (int(arr_x2), int(arr_y2)),
            ])
            surface.blit(arrow_surf, (0, 0))

        # Emit particles at the leading edge
        if 0.1 < self.progress < 0.95:
            if random.random() < 0.3:
                particles.emit(cx, cy, self.color, count=2, spread=1.5, lifetime=0.4, size=2)

        # Label at midpoint
        if self.progress > 0.5 and self.label:
            mx = (sx + tx) / 2
            my = (sy + ty) / 2

            lbl_surf = font_small.render(self.label, True, COLORS["text_dim"])
            bg_rect = lbl_surf.get_rect(center=(int(mx), int(my) - 10))
            bg_rect.inflate_ip(8, 4)
            bg_surf = pygame.Surface(bg_rect.size, pygame.SRCALPHA)
            pygame.draw.rect(bg_surf, (*COLORS["surface"], 200), bg_surf.get_rect(), border_radius=4)
            surface.blit(bg_surf, bg_rect)
            surface.blit(lbl_surf, lbl_surf.get_rect(center=(int(mx), int(my) - 10)))


# ===================================================================
# DEMO SCENARIO — The Code Graph Story
# ===================================================================

def build_demo_scenario():
    """
    Build a step-by-step animation scenario showing how Chillax.AI
    analyzes a Python project — modules appear, then functions,
    then connections form between them.
    """

    # Layout positions — arranged in a clean hierarchy
    cx, cy = WIDTH // 2, HEIGHT // 2

    steps = []

    # --- Step 1: Modules appear ---
    modules = [
        ("auth.py",     cx - 350, cy - 120, "module"),
        ("database.py", cx - 350, cy + 120, "module"),
        ("models.py",   cx,       cy - 200, "module"),
        ("orders.py",   cx + 200, cy,       "module"),
        ("users.py",    cx - 100, cy + 50,  "module"),
        ("config.py",   cx + 350, cy - 150, "module"),
    ]

    steps.append({
        "title": "Scanning Python modules...",
        "subtitle": "Chillax.AI walks the project directory and discovers .py files",
        "nodes": modules,
        "edges": [],
    })

    # --- Step 2: Functions appear ---
    functions = [
        ("login_user",     cx - 450, cy - 180, "function"),
        ("hash_password",  cx - 460, cy - 60,  "function"),
        ("create_token",   cx - 250, cy - 200, "function"),
        ("get_connection", cx - 390, cy + 60,  "function"),
        ("query",          cx - 300, cy + 180,  "function"),
        ("User",           cx - 60,  cy - 280, "class"),
        ("Order",          cx + 80,  cy - 280, "class"),
        ("checkout",       cx + 300, cy + 80,  "function"),
        ("handle_register",cx - 180, cy + 130, "function"),
    ]

    steps.append({
        "title": "Extracting functions & classes...",
        "subtitle": "Using Python AST to parse every file and extract code structure",
        "nodes": functions,
        "edges": [],
    })

    # --- Step 3: Import edges ---
    import_edges = [
        ("auth.py", "database.py", "imports"),
        ("auth.py", "config.py", "imports"),
        ("users.py", "auth.py", "imports"),
        ("orders.py", "auth.py", "imports"),
        ("orders.py", "database.py", "imports"),
    ]

    steps.append({
        "title": "Mapping import relationships...",
        "subtitle": "Tracing which modules depend on which other modules",
        "nodes": [],
        "edges": import_edges,
        "edge_color": COLORS["cyan"],
    })

    # --- Step 4: Function call edges ---
    call_edges = [
        ("login_user", "hash_password", "calls"),
        ("login_user", "query", "calls"),
        ("login_user", "create_token", "calls"),
        ("handle_register", "hash_password", "calls"),
        ("checkout", "query", "calls"),
        ("checkout", "get_connection", "calls"),
    ]

    steps.append({
        "title": "Tracing function calls...",
        "subtitle": "Building the call graph — who calls whom across the codebase",
        "nodes": [],
        "edges": call_edges,
        "edge_color": COLORS["green"],
    })

    # --- Step 5: Highlight a flow ---
    steps.append({
        "title": "✨ The login flow is revealed!",
        "subtitle": "login_user → hash_password → query → create_token",
        "nodes": [],
        "edges": [],
        "highlight": ["login_user", "hash_password", "query", "create_token"],
    })

    return steps


# ===================================================================
# MAIN ANIMATION LOOP
# ===================================================================

def main():
    pygame.init()
    pygame.display.set_caption("🍝 Chillax.AI — Code Graph Visualization")
    screen = pygame.display.set_mode((WIDTH, HEIGHT), pygame.RESIZABLE)
    clock = pygame.time.Clock()

    # Fonts
    try:
        font_title = pygame.font.SysFont("Inter", 28, bold=True)
        font_subtitle = pygame.font.SysFont("Inter", 16)
        font_label = pygame.font.SysFont("Inter", 13, bold=True)
        font_small = pygame.font.SysFont("Inter", 11)
        font_hud = pygame.font.SysFont("JetBrains Mono", 12)
    except Exception:
        font_title = pygame.font.SysFont("arial", 28, bold=True)
        font_subtitle = pygame.font.SysFont("arial", 16)
        font_label = pygame.font.SysFont("arial", 13, bold=True)
        font_small = pygame.font.SysFont("arial", 11)
        font_hud = pygame.font.SysFont("consolas", 12)

    # Build scenario
    steps = build_demo_scenario()
    all_nodes = {}     # id -> AnimatedNode
    all_edges = []     # AnimatedEdge list
    particles = ParticleSystem()

    current_step = -1
    step_time = 0
    step_auto_advance = True
    step_delay = 2.5  # seconds between steps
    paused = False
    show_instructions = True

    # Title & subtitle state
    current_title = "Press SPACE or wait to begin"
    current_subtitle = "Chillax.AI — Visualizing code relationships"
    title_opacity = 1.0

    # Highlight state
    highlight_set = set()
    highlight_pulse = 0

    def advance_step():
        nonlocal current_step, step_time, current_title, current_subtitle
        nonlocal highlight_set

        current_step += 1
        step_time = 0

        if current_step >= len(steps):
            current_step = -1
            # Reset
            all_nodes.clear()
            all_edges.clear()
            highlight_set.clear()
            current_title = "Press SPACE to replay"
            current_subtitle = "Or press Q to quit"
            return

        step = steps[current_step]
        current_title = step.get("title", "")
        current_subtitle = step.get("subtitle", "")

        # Add new nodes
        for i, (nid, nx, ny, ntype) in enumerate(step.get("nodes", [])):
            node = AnimatedNode(nid, nid, ntype, nx, ny, delay=i * 0.15)
            all_nodes[nid] = node
            node.start()
            particles.emit(nx, ny, NODE_COLORS.get(ntype, COLORS["blue"]),
                           count=8, spread=3, lifetime=0.6, size=4)

        # Add new edges
        edge_color = step.get("edge_color", COLORS["blue"])
        for i, (src, tgt, lbl) in enumerate(step.get("edges", [])):
            if src in all_nodes and tgt in all_nodes:
                edge = AnimatedEdge(all_nodes[src], all_nodes[tgt], lbl,
                                    delay=i * 0.2, color=edge_color)
                all_edges.append(edge)
                edge.start()

        # Handle highlights
        if "highlight" in step:
            highlight_set = set(step["highlight"])
        else:
            highlight_set = set()

    # ---- Main loop ----
    running = True
    total_time = 0

    while running:
        dt = clock.tick(FPS) / 1000.0
        total_time += dt
        mouse_pos = pygame.mouse.get_pos()

        # Events
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE or event.key == pygame.K_q:
                    running = False
                elif event.key == pygame.K_SPACE:
                    advance_step()
                    step_time = 0
                elif event.key == pygame.K_r:
                    # Reset
                    current_step = -1
                    all_nodes.clear()
                    all_edges.clear()
                    highlight_set.clear()
                    current_title = "Press SPACE or wait to begin"
                    current_subtitle = "Chillax.AI — Visualizing code relationships"
                elif event.key == pygame.K_p:
                    paused = not paused
                elif event.key == pygame.K_h:
                    show_instructions = not show_instructions

        # Auto-advance
        if not paused:
            step_time += dt
            if step_auto_advance and step_time > step_delay:
                advance_step()

        # Update
        highlight_pulse += dt * 3
        particles.update(dt)

        for node in all_nodes.values():
            node.update(dt, mouse_pos)

        for edge in all_edges:
            edge.update(dt)

        # ============ DRAW ============
        screen.fill(COLORS["bg"])

        # Subtle grid pattern
        grid_surf = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        grid_alpha = 15
        for gx in range(0, WIDTH, 40):
            pygame.draw.line(grid_surf, (*COLORS["border"], grid_alpha), (gx, 0), (gx, HEIGHT))
        for gy in range(0, HEIGHT, 40):
            pygame.draw.line(grid_surf, (*COLORS["border"], grid_alpha), (0, gy), (WIDTH, gy))
        screen.blit(grid_surf, (0, 0))

        # Draw edges (behind nodes)
        for edge in all_edges:
            edge.draw(screen, font_small, particles)

        # Draw highlight connections
        if highlight_set:
            hl_nodes = [all_nodes[h] for h in highlight_set if h in all_nodes]
            for i in range(len(hl_nodes) - 1):
                n1, n2 = hl_nodes[i], hl_nodes[i + 1]
                pulse_alpha = int(100 + 80 * math.sin(highlight_pulse))
                hl_surf = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
                pygame.draw.line(hl_surf, (*COLORS["pink"], pulse_alpha),
                                 (int(n1.x), int(n1.y)), (int(n2.x), int(n2.y)), 4)
                screen.blit(hl_surf, (0, 0))
                # Trail particles
                if random.random() < 0.15:
                    mx = (n1.x + n2.x) / 2 + random.uniform(-10, 10)
                    my = (n1.y + n2.y) / 2 + random.uniform(-10, 10)
                    particles.emit(mx, my, COLORS["pink"], count=1, spread=1, lifetime=0.5, size=2)

        # Draw nodes
        for node in all_nodes.values():
            # Highlight pulse
            if node.id in highlight_set:
                pulse_r = int(node.current_radius + 8 + 4 * math.sin(highlight_pulse))
                pulse_surf = pygame.Surface((pulse_r * 2, pulse_r * 2), pygame.SRCALPHA)
                pulse_alpha = int(60 + 30 * math.sin(highlight_pulse))
                pygame.draw.circle(pulse_surf, (*COLORS["pink"], pulse_alpha),
                                   (pulse_r, pulse_r), pulse_r)
                screen.blit(pulse_surf, (int(node.x) - pulse_r, int(node.y) - pulse_r))
            node.draw(screen, font_small, font_label)

        # Draw particles (on top)
        particles.draw(screen)

        # ---- HUD: Title & Subtitle ----
        # Top bar
        top_bar = pygame.Surface((WIDTH, 80), pygame.SRCALPHA)
        pygame.draw.rect(top_bar, (*COLORS["surface"], 200), top_bar.get_rect())
        screen.blit(top_bar, (0, 0))

        # Logo
        logo_text = font_title.render("🍝 Chillax.AI", True, COLORS["text"])
        screen.blit(logo_text, (24, 12))

        # Step indicator
        step_text = f"Step {current_step + 1}/{len(steps)}" if current_step >= 0 else "Ready"
        step_surf = font_hud.render(step_text, True, COLORS["blue"])
        screen.blit(step_surf, (WIDTH - step_surf.get_width() - 24, 16))

        # Status
        if paused:
            pause_surf = font_hud.render("⏸ PAUSED", True, COLORS["orange"])
            screen.blit(pause_surf, (WIDTH - pause_surf.get_width() - 24, 36))

        # Title / subtitle panel (bottom)
        if current_title:
            # Background pill
            title_surf = font_title.render(current_title, True, COLORS["text"])
            sub_surf = font_subtitle.render(current_subtitle, True, COLORS["text_dim"])

            panel_w = max(title_surf.get_width(), sub_surf.get_width()) + 60
            panel_h = 80
            panel_x = (WIDTH - panel_w) // 2
            panel_y = HEIGHT - panel_h - 24

            panel_bg = pygame.Surface((panel_w, panel_h), pygame.SRCALPHA)
            pygame.draw.rect(panel_bg, (*COLORS["surface"], 220),
                             panel_bg.get_rect(), border_radius=12)
            pygame.draw.rect(panel_bg, (*COLORS["border"], 100),
                             panel_bg.get_rect(), width=1, border_radius=12)
            screen.blit(panel_bg, (panel_x, panel_y))

            screen.blit(title_surf,
                         title_surf.get_rect(center=(WIDTH // 2, panel_y + 26)))
            screen.blit(sub_surf,
                         sub_surf.get_rect(center=(WIDTH // 2, panel_y + 54)))

        # ---- Instructions overlay ----
        if show_instructions:
            instr_lines = [
                "SPACE  Next step    R  Reset    P  Pause    H  Hide this    Q  Quit"
            ]
            instr_y = HEIGHT - 10
            for line in reversed(instr_lines):
                instr_surf = font_hud.render(line, True, COLORS["text_dim"])
                screen.blit(instr_surf, (24, instr_y - instr_surf.get_height()))
                instr_y -= instr_surf.get_height() + 4

        pygame.display.flip()

    pygame.quit()
    sys.exit()


if __name__ == "__main__":
    main()
