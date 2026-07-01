"""Synthetic profile handler for benchmark use only."""

CACHE = {}

PROFILES = {
    "acct-100": {"name": "Example Workspace", "plan": "team"},
}

VIEWER_ROLES = {
    ("acct-100", "viewer-owner"): "owner",
    ("acct-100", "viewer-guest"): "guest",
}


def load_profile(account_id):
    return PROFILES[account_id].copy()


def get_profile(account_id, viewer_id):
    if account_id in CACHE:
        return CACHE[account_id]

    profile = load_profile(account_id)
    role = VIEWER_ROLES.get((account_id, viewer_id), "guest")
    profile["can_edit"] = role == "owner"
    CACHE[account_id] = profile
    return profile
