from site_hooks import field_groups

from .test_export import docs


def test_role_hidden_groups_hold_only_role_fields(built):
    for d in docs(built).values():
        for g in field_groups(d["fields"]):
            if not g["roles"]:
                continue
            allowed = set(g["roles"].split())
            for f in g["fields"]:
                assert f.get("roles") and set(f["roles"]) <= allowed, (d["id"], f["id"])
