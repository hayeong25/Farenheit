from pydantic import BaseModel


class RouteResponse(BaseModel):
    id: int
    origin_code: str
    dest_code: str
    origin_city: str | None = None
    dest_city: str | None = None
    is_active: bool

    model_config = {"from_attributes": True}


class AirportSearchResponse(BaseModel):
    iata_code: str
    name: str
    city: str
    city_ko: str | None = None
    country_code: str

    model_config = {"from_attributes": True}
