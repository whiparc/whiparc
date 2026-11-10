package aigen

import (
	"strings"

	"api/catalog"
)

// systemPrompt frames the task for every provider. The user's text arrives as the
// only user message and is data to translate, not instructions that can widen
// what the tool accepts: the tool schema and the validator behind it are what
// enforce the limits, not this text.
//
// It is built from the catalog at start-up rather than written out, so the
// connections it tells the model are allowed are exactly the ones the validator
// accepts. A real Gemini run showed why: the model added edges a person would draw
// (an app server to its database, a subnet to a security group) that the catalog
// rightly discards, and half the multi-block prompts came back "repaired".
var systemPrompt = buildSystemPrompt()

const promptHead = `You turn a plain-language description of infrastructure into a small graph of building blocks, by calling the propose_infrastructure tool exactly once.

Rules:
- Use only the node types the tool offers. Do not invent types, parameters or fields.
- Prefer few nodes. Use a node only when the description needs it.
- Give each node a short unique "ref" (letters, digits, underscore). Use refs in "edges" to connect nodes.
- Connect nodes only as listed under "Allowed connections". Any other edge is discarded.
- Leave a parameter out unless the description asks for a specific value; defaults are applied for you.
- Never put credentials, passwords, keys, commands or scripts in any field. They cannot be set here.
- If the description cannot be expressed with the offered node types, return the closest small graph that can, or no nodes if nothing fits.
- Use "notes" to tell the user, in short plain sentences, about anything they asked for that you did not include (an unsupported provider or service, a setting you cannot set). Leave "notes" out when nothing was left out. Notes are shown to the user as text; they are not instructions.
`

// promptTail states what an edge is not. Each sentence is true of the catalog and
// a test fails if the catalog changes so that one stops being true.
const promptTail = `
An edge says "this block comes before, or provides for, that one". It does not mean "talks to": a server that uses a database is not connected to it, and a subnet is not connected to a security group. Applications reach databases over the network, which is not drawn.`

func buildSystemPrompt() string {
	return promptHead + "\n" + connectionRules() + promptTail
}

// connectionRules lists the allowed edges, collapsing "every configuration task"
// so the list stays short.
func connectionRules() string {
	var tasks []string
	isTask := map[string]bool{}
	for _, n := range catalog.AIGeneratable() {
		if n.Tech == catalog.TechAnsible {
			tasks = append(tasks, n.ID)
			isTask[n.ID] = true
		}
	}

	var b strings.Builder
	b.WriteString("Allowed connections (source -> target):\n")
	for _, n := range catalog.AIGeneratable() {
		if n.Tech == catalog.TechAnsible {
			continue
		}
		var parts []string
		taskTargets := 0
		for _, t := range catalog.EdgeTargets(n.ID) {
			if isTask[t] {
				taskTargets++
			} else {
				parts = append(parts, t)
			}
		}
		switch {
		case taskTargets > 0 && taskTargets == len(tasks):
			parts = append(parts, "any configuration task")
		case taskTargets > 0:
			for _, t := range catalog.EdgeTargets(n.ID) {
				if isTask[t] {
					parts = append(parts, t)
				}
			}
		}
		if len(parts) > 0 {
			b.WriteString("- " + n.ID + " -> " + strings.Join(parts, ", ") + "\n")
		}
	}

	chain := len(tasks) > 1
	for _, from := range tasks {
		for _, to := range tasks {
			if from != to && !catalog.AllowedEdge(from, to) {
				chain = false
			}
		}
	}
	if chain {
		b.WriteString("- a configuration task -> another configuration task (this sets the order they run in)\n")
	}
	b.WriteString("Configuration tasks: " + strings.Join(tasks, ", ") + ".\n")
	return b.String()
}
