"use strict";

function executionAuthorityTeam(event) {
  if (event?.kind === "team.started") return event.result?.team || null;
  if (event?.kind === "team.promoted" && event.data?.target === "execute") {
    return event.result?.team || null;
  }
  return null;
}

module.exports = { executionAuthorityTeam };
