// spec/app/models.md, "Story: Filter the catalog"
import { ManagedRuntime } from "effect";
import { Machine, machine } from "../../../../gen/app__models.effect.vibe";

export const catalogRuntime = ManagedRuntime.make(machine());

// spec/app/models.md, "Each choice moves only its own field"
export const filterMachine = machine();
export const filterDispatch = (input: unknown) => Machine.use((m) => m.receive(input));
export const filterObserve = () => Machine.use((m) => m.get());
