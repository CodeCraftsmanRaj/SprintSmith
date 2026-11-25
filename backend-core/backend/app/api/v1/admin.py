"""Admin-only project and user overview for the operations console."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.domain.models import Project, ProjectMember, User

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/overview")
def admin_overview(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Return platform users and projects with active collaborator counts."""
    if user.role.lower() != "admin":
        raise HTTPException(status_code=403, detail="Administrator role required")

    users = list(db.scalars(select(User).order_by(User.full_name.asc(), User.email.asc())))
    project_rows = db.execute(
        select(Project, User.full_name, User.email)
        .join(User, User.id == Project.owner_id)
        .order_by(Project.created_at.desc(), Project.name.asc())
    ).all()
    collaborator_counts = dict(db.execute(
        select(ProjectMember.project_id, func.count(ProjectMember.user_id))
        .join(Project, Project.id == ProjectMember.project_id)
        .where(ProjectMember.user_id != Project.owner_id)
        .group_by(ProjectMember.project_id)
    ).all())

    projects = [
        {
            "id": project.id,
            "name": project.name,
            "owner_name": owner_name,
            "owner_email": owner_email,
            "collaborators": collaborator_counts.get(project.id, 0),
            "created_at": project.created_at,
        }
        for project, owner_name, owner_email in project_rows
    ]
    return {
        "summary": {
            "users": len(users),
            "projects": len(projects),
            "collaborators": sum(project["collaborators"] for project in projects),
            "admins": sum(user_item.role.lower() == "admin" for user_item in users),
        },
        "users": [
            {
                "id": user_item.id,
                "full_name": user_item.full_name,
                "email": user_item.email,
                "role": user_item.role,
                "is_active": user_item.is_active,
                "created_at": user_item.created_at,
            }
            for user_item in users
        ],
        "projects": projects,
    }
