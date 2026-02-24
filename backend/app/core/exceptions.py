class FarenheitError(Exception):
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class NotFoundError(FarenheitError):
    def __init__(self, resource: str):
        super().__init__(f"{resource} not found", status_code=404)


class CollectorError(FarenheitError):
    def __init__(self, source: str, message: str):
        super().__init__(f"Collector [{source}] error: {message}", status_code=502)
