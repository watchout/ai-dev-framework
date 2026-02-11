const PHASES = [
  { id: -1, name: "Idea Validation", icon: "?" },
  { id: 0, name: "Requirements", icon: "D" },
  { id: 0.5, name: "Market Validation", icon: "L" },
  { id: 1, name: "MVP", icon: "1" },
  { id: 2, name: "Core Features", icon: "2" },
  { id: 3, name: "Polish", icon: "3" },
  { id: 4, name: "Beta", icon: "4" },
  { id: 5, name: "Launch Prep", icon: "5" },
  { id: 6, name: "Growth", icon: "G" },
];

const CLI_COMMANDS = [
  { cmd: "framework status", desc: "View current progress" },
  { cmd: "framework discover", desc: "Start discovery flow" },
  { cmd: "framework generate", desc: "Generate SSOT documents" },
  { cmd: "framework plan", desc: "Create implementation plan" },
  { cmd: "framework audit ssot <file>", desc: "Run SSOT audit" },
  { cmd: "framework audit code <file>", desc: "Run code audit" },
  { cmd: "framework run", desc: "Execute next task" },
];

const AGENT_TEAMS = [
  {
    name: "visual-tester",
    role: "Visual Testing",
    desc: "Playwright MCP browser testing",
  },
  {
    name: "code-reviewer",
    role: "Adversarial Review",
    desc: "Role B code audit (100pt scoring)",
  },
  {
    name: "ssot-explorer",
    role: "SSOT Search",
    desc: "Document search & summarization",
  },
];

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        border: "1px solid #222",
        borderRadius: "8px",
        padding: "20px",
        backgroundColor: "#111",
      }}
    >
      <h2
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          fontWeight: 600,
          color: "#999",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

export default function Home() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Phase Timeline */}
      <Card title="Development Lifecycle">
        <div
          style={{
            display: "flex",
            gap: "4px",
            overflowX: "auto",
            paddingBottom: "8px",
          }}
        >
          {PHASES.map((phase) => (
            <div
              key={phase.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                minWidth: "100px",
                padding: "12px 8px",
                borderRadius: "6px",
                border: "1px solid #333",
                backgroundColor: "#1a1a1a",
                fontSize: "12px",
              }}
            >
              <span
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  backgroundColor: "#222",
                  border: "1px solid #444",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "11px",
                  color: "#888",
                }}
              >
                {phase.icon}
              </span>
              <span style={{ color: "#aaa", textAlign: "center" }}>
                {phase.name}
              </span>
            </div>
          ))}
        </div>
        <p style={{ color: "#666", fontSize: "13px", marginTop: "12px" }}>
          Run <code style={{ color: "#888" }}>framework status</code> to see
          current phase.
        </p>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
        {/* CLI Commands */}
        <Card title="CLI Commands">
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {CLI_COMMANDS.map((item) => (
              <div
                key={item.cmd}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: "4px",
                  backgroundColor: "#1a1a1a",
                  fontSize: "13px",
                }}
              >
                <code style={{ color: "#4ec9b0" }}>{item.cmd}</code>
                <span style={{ color: "#666", fontSize: "12px" }}>
                  {item.desc}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* Agent Teams */}
        <Card title="Agent Teams (CLI Pattern)">
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {AGENT_TEAMS.map((agent) => (
              <div
                key={agent.name}
                style={{
                  padding: "12px",
                  borderRadius: "4px",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #222",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <code style={{ color: "#dcdcaa", fontSize: "13px" }}>
                    {agent.name}
                  </code>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#666",
                      border: "1px solid #333",
                      borderRadius: "3px",
                      padding: "1px 6px",
                    }}
                  >
                    {agent.role}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: "#888",
                    fontSize: "12px",
                  }}
                >
                  {agent.desc}
                </p>
              </div>
            ))}
            <p style={{ color: "#666", fontSize: "12px", margin: 0 }}>
              .claude/agents/ directory - auto-created by{" "}
              <code style={{ color: "#888" }}>framework init</code>
            </p>
          </div>
        </Card>
      </div>

      {/* Getting Started */}
      <Card title="Getting Started">
        <div style={{ fontSize: "14px", color: "#aaa", lineHeight: 1.8 }}>
          <ol style={{ margin: 0, paddingLeft: "20px" }}>
            <li>
              <code style={{ color: "#4ec9b0" }}>framework init my-app</code>{" "}
              — Create a new project
            </li>
            <li>
              <code style={{ color: "#4ec9b0" }}>cd my-app</code> — Enter
              project directory
            </li>
            <li>
              <code style={{ color: "#4ec9b0" }}>framework discover</code>{" "}
              — Start idea validation (Stage 0-5)
            </li>
            <li>
              <code style={{ color: "#4ec9b0" }}>framework generate</code>{" "}
              — Generate SSOT documents
            </li>
            <li>
              <code style={{ color: "#4ec9b0" }}>framework plan</code>{" "}
              — Create implementation plan
            </li>
            <li>
              <code style={{ color: "#4ec9b0" }}>framework run</code>{" "}
              — Start development
            </li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
