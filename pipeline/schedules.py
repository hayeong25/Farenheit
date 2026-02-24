from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    # Collect prices for all active routes every 30 minutes (peak hours)
    "collect-prices-peak": {
        "task": "pipeline.tasks.collect_prices.collect_all_routes",
        "schedule": crontab(minute="*/30", hour="6-23"),
    },
    # Off-peak: every 2 hours
    "collect-prices-offpeak": {
        "task": "pipeline.tasks.collect_prices.collect_all_routes",
        "schedule": crontab(minute="0", hour="0,2,4"),
    },
    # Run prediction models every hour (15 min past)
    "run-predictions": {
        "task": "pipeline.tasks.run_prediction.predict_all_active",
        "schedule": crontab(minute="15"),
    },
    # Generate recommendations after predictions
    "generate-recommendations": {
        "task": "pipeline.tasks.generate_recommendations.generate_all",
        "schedule": crontab(minute="30"),
    },
    # Retrain models weekly (Sunday 3 AM UTC)
    "retrain-models": {
        "task": "pipeline.tasks.run_prediction.retrain_models",
        "schedule": crontab(minute="0", hour="3", day_of_week="0"),
    },
    # Data retention cleanup (Monday 4 AM UTC)
    "data-retention": {
        "task": "pipeline.tasks.cleanup.apply_retention_policy",
        "schedule": crontab(minute="0", hour="4", day_of_week="1"),
    },
}
