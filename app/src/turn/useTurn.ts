import { useEffect, useState, useCallback } from "react";
import type { Orchestrator, OrchestratorState } from "@lyra/core/turn/Orchestrator.ts";

export function useTurn(orc: Orchestrator): {
  state: OrchestratorState;
  submit: (text: string) => Promise<void>;
} {
  const [state, setState] = useState<OrchestratorState>(orc.getState());

  useEffect(() => {
    return orc.subscribe(setState);
  }, [orc]);

  const submit = useCallback(
    (text: string) => orc.onUserInput(text),
    [orc],
  );

  return { state, submit };
}
