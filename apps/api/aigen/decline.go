package aigen

import (
	"encoding/json"

	"api/catalog"
)

// DeclineEmpty is the reason reported when a model built nothing and gave no
// recognised reason. It is the server's own, never a model's.
const DeclineEmpty = "empty"

// DeclineMessage is what the user reads when nothing could be built. The model
// picks a reason code (catalog.DeclineReasons); the words are written here, so a
// refusal can neither be talked into saying something else nor carry model text.
// An unknown or empty code gets the generic message.
func DeclineMessage(code string) string {
	switch code {
	case catalog.DeclineNotInfrastructure:
		return "That isn't something I can build. I create infrastructure on your canvas: servers, networks, firewalls, storage and databases, and the software that runs on them. Try describing what you want to run, for example \"a Node.js app on a server with a PostgreSQL database\"."
	case catalog.DeclineUnsupported:
		return "That needs a platform or service I can't create yet. I can build AWS servers, networks, firewalls, storage and databases, and install software on servers. Kubernetes, serverless functions, Google Cloud and Azure aren't available."
	case catalog.DeclineUnsafe:
		return "I can't do that. I only place the building blocks in the library, so I won't write custom scripts or commands, clone repositories, or set passwords, keys and credentials. You can add those yourself on the canvas once the nodes exist."
	case catalog.DeclineTooVague:
		return "I need a little more to go on. Say what you want to run and where, for example \"a web server with nginx and an S3 bucket for uploads\"."
	}
	return "I couldn't build anything from that description. Describe the infrastructure you want, for example \"a web server with nginx and an S3 bucket for uploads\"."
}

// cleanDecline reads the model's optional decline value. Anything that is not
// exactly one of the known codes counts as no reason, so a malformed value costs
// only the reason, never an otherwise usable answer.
func cleanDecline(raw json.RawMessage) string {
	var s string
	if len(raw) == 0 || json.Unmarshal(raw, &s) != nil {
		return ""
	}
	for _, code := range catalog.DeclineReasons {
		if s == code {
			return code
		}
	}
	return ""
}
