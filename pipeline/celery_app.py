from celery import Celery

from pipeline.config import pipeline_settings
from pipeline.schedules import CELERY_BEAT_SCHEDULE

app = Celery(
    "farenheit-pipeline",
    broker=pipeline_settings.CELERY_BROKER_URL,
    backend=pipeline_settings.CELERY_RESULT_BACKEND,
)

app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    beat_schedule=CELERY_BEAT_SCHEDULE,
)

app.autodiscover_tasks(["pipeline.tasks"])
