"""Project-scoped task CRUD endpoints for the Kanban board."""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_project_service
from app.database import get_db
from app.domain.models import Project, ProjectMember, Task, User
from app.domain.schemas.task import TaskCreate, TaskOut, TaskUpdate
from app.services.project_service import ProjectService
from app.core.exceptions import AuthorisationError, ResourceNotFoundError

router = APIRouter(prefix="/projects/{project_id}/tasks", tags=["Tasks"])


def _accessible_project(project_id: str, user: User, service: ProjectService, *, write: bool = False) -> Project:
    try:
        return service.get_project_or_fail(project_id, user, write=write)
    except ResourceNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error)) from error
    except AuthorisationError as error:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(error)) from error


def _validate_assignee(project: Project, assignee_id: str | None, db: Session) -> None:
    if assignee_id is None:
        return
    assignee = db.get(User, assignee_id)
    member = db.scalar(select(ProjectMember.id).where(
        ProjectMember.project_id == project.id,
        ProjectMember.user_id == assignee_id,
    ))
    if not assignee or not assignee.is_active or (assignee.id != project.owner_id and not member):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Assignee must be an active member of this project")


@router.get("", response_model=list[TaskOut])
def list_tasks(
    project_id: str,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    _accessible_project(project_id, user, project_service)
    return db.scalars(select(Task).where(Task.project_id == project_id).order_by(Task.created_at.desc())).all()


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: str,
    payload: TaskCreate,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    project = _accessible_project(project_id, user, project_service, write=True)
    _validate_assignee(project, payload.assignee_id, db)
    task = Task(id=str(uuid4()), project_id=project_id, created_by=user.id, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    project_id: str,
    task_id: str,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    project = _accessible_project(project_id, user, project_service, write=True)
    task = db.scalar(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    updates = payload.model_dump(exclude_unset=True)
    if "assignee_id" in updates:
        _validate_assignee(project, updates["assignee_id"], db)
    for key, value in updates.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    project_id: str,
    task_id: str,
    db: Session = Depends(get_db),
    project_service: ProjectService = Depends(get_project_service),
    user: User = Depends(get_current_user),
):
    _accessible_project(project_id, user, project_service, write=True)
    task = db.scalar(select(Task).where(Task.id == task_id, Task.project_id == project_id))
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    db.delete(task)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
