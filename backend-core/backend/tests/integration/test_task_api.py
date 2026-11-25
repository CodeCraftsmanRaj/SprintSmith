"""Project-scoped task CRUD, validation, and authorization tests."""


def create_project(client, headers, name):
    response = client.post("/api/v1/projects", json={"name": name}, headers=headers)
    assert response.status_code == 201
    return response.json()["id"]


def test_task_lifecycle_and_persisted_fields(client, dev_headers, dev_user):
    project_id = create_project(client, dev_headers, "Kanban project")
    payload = {
        "title": "Implement transfer limits", "description": "Validate bounds and eligibility.",
        "status": "todo", "priority": "high", "assignee_id": dev_user.id,
        "due_date": "2026-12-15", "story_points": 5,
    }
    created = client.post(f"/api/v1/projects/{project_id}/tasks", json=payload, headers=dev_headers)
    assert created.status_code == 201
    task = created.json()
    assert {key: task[key] for key in payload} == payload
    assert task["project_id"] == project_id

    listed = client.get(f"/api/v1/projects/{project_id}/tasks", headers=dev_headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [task["id"]]

    moved = client.patch(
        f"/api/v1/projects/{project_id}/tasks/{task['id']}",
        json={"status": "in_progress"}, headers=dev_headers,
    )
    assert moved.status_code == 200
    assert moved.json()["status"] == "in_progress"

    edited = client.patch(
        f"/api/v1/projects/{project_id}/tasks/{task['id']}",
        json={"title": "Updated transfer limits", "story_points": 8, "due_date": None}, headers=dev_headers,
    )
    assert edited.status_code == 200
    assert edited.json()["title"] == "Updated transfer limits"
    assert edited.json()["story_points"] == 8
    assert edited.json()["due_date"] is None

    deleted = client.delete(f"/api/v1/projects/{project_id}/tasks/{task['id']}", headers=dev_headers)
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/projects/{project_id}/tasks", headers=dev_headers).json() == []


def test_tasks_are_isolated_by_project_and_task_id(client, dev_headers):
    first = create_project(client, dev_headers, "First project")
    second = create_project(client, dev_headers, "Second project")
    task = client.post(f"/api/v1/projects/{first}/tasks", json={"title": "Private task"}, headers=dev_headers).json()
    assert client.get(f"/api/v1/projects/{second}/tasks", headers=dev_headers).json() == []
    assert client.patch(f"/api/v1/projects/{second}/tasks/{task['id']}", json={"status": "done"}, headers=dev_headers).status_code == 404
    assert client.delete(f"/api/v1/projects/{second}/tasks/{task['id']}", headers=dev_headers).status_code == 404


def test_viewer_can_read_but_cannot_change_tasks(client, pm_headers, dev_user, dev_headers):
    project_id = create_project(client, pm_headers, "Viewer project")
    assert client.post(f"/api/v1/projects/{project_id}/members?email={dev_user.email}&role=viewer", headers=pm_headers).status_code == 201
    assert client.get(f"/api/v1/projects/{project_id}/tasks", headers=dev_headers).status_code == 200
    assert client.post(f"/api/v1/projects/{project_id}/tasks", json={"title": "Forbidden"}, headers=dev_headers).status_code == 403


def test_task_validation_and_member_assignee(client, pm_headers, dev_user, dev_headers):
    project_id = create_project(client, pm_headers, "Assignment project")
    base = f"/api/v1/projects/{project_id}/tasks"
    assert client.post(base, json={"title": "   "}, headers=pm_headers).status_code == 422
    assert client.post(base, json={"title": "Bad priority", "priority": "critical"}, headers=pm_headers).status_code == 422
    assert client.post(base, json={"title": "Bad points", "story_points": -1}, headers=pm_headers).status_code == 422
    assert client.post(base, json={"title": "Non member", "assignee_id": dev_user.id}, headers=pm_headers).status_code == 422

    assert client.post(f"/api/v1/projects/{project_id}/members?email={dev_user.email}&role=editor", headers=pm_headers).status_code == 201
    assigned = client.post(base, json={"title": "Assigned task", "assignee_id": dev_user.id}, headers=pm_headers)
    assert assigned.status_code == 201
    assert assigned.json()["assignee_id"] == dev_user.id
    assert client.patch(f"{base}/{assigned.json()['id']}", json={"assignee_id": "missing-user"}, headers=pm_headers).status_code == 422
