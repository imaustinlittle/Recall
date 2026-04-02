import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
from app.models.job import JobStatus, JobType


class JobOut(BaseModel):
    id: uuid.UUID
    meeting_id: uuid.UUID
    celery_task_id: Optional[str]
    job_type: JobType
    status: JobStatus
    progress: float
    message: Optional[str]
    error_info: Optional[dict]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    model_config = {"from_attributes": True}
