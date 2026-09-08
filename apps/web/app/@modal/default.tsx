// Empty by default: the @modal parallel slot renders nothing unless the
// intercepting route at (.)templates/[id] matches — i.e. every page except
// a card-click-triggered template popup. Required by Next.js whenever a
// parallel route slot doesn't have an active match for the current URL.
export default function Default() {
  return null;
}
