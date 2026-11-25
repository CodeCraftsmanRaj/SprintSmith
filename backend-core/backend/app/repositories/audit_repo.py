from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.domain.models import Artifact, AuditLog, Project, Requirement, User
from app.repositories.base import BaseRepository


class AuditRepository(BaseRepository[AuditLog]):
    def __init__(self, db: Session):
        super().__init__(db, AuditLog)

    def record(
        self,
        user_id: str | None,
        action: str,
        resource_type: str,
        resource_id: str | None,
        details: dict | None = None,
    ) -> AuditLog:
        entry = AuditLog(
            id=self.new_id(),
            user_id=user_id,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details or {},
        )
        self.db.add(entry)
        return entry

    def list_recent(self, limit: int = 100) -> list[AuditLog]:
        stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
        return list(self.db.scalars(stmt))

    def list_for_project(self, project_id: str, limit: int = 100) -> list[dict]:
        artifact_ids = select(Artifact.id).where(Artifact.project_id == project_id)
        requirement_ids = select(Requirement.id).where(Requirement.project_id == project_id)
        stmt = (
            select(AuditLog, User.full_name, User.email)
            .outerjoin(User, User.id == AuditLog.user_id)
            .where(or_(
                (AuditLog.resource_type == "project") & (AuditLog.resource_id == project_id),
                (AuditLog.resource_type == "artifact") & AuditLog.resource_id.in_(artifact_ids),
                (AuditLog.resource_type == "requirement") & AuditLog.resource_id.in_(requirement_ids),
            ))
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
        return [
            {
                "id": row.id,
                "action": row.action,
                "resource_type": row.resource_type,
                "resource_id": row.resource_id,
                "details": row.details or {},
                "actor_name": full_name,
                "actor_email": email,
                "created_at": row.created_at,
            }
            for row, full_name, email in self.db.execute(stmt).all()
        ]
