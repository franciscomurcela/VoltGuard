# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401
from typing import List, Dict  # noqa: F401

from swagger_server.models.base_model_ import Model
from swagger_server import util


class NotificationResponse(Model):
    def __init__(self, id: str=None, client_id: str=None, status: str=None, created_at: datetime=None):  # noqa: E501
        self.swagger_types = {
            'id': str,
            'client_id': str,
            'status': str,
            'created_at': datetime
        }
        self.attribute_map = {
            'id': 'id',
            'client_id': 'client_id',
            'status': 'status',
            'created_at': 'created_at'
        }
        self._id = id
        self._client_id = client_id
        self._status = status
        self._created_at = created_at

    @classmethod
    def from_dict(cls, dikt) -> 'NotificationResponse':
        return util.deserialize_model(dikt, cls)

    @property
    def id(self) -> str:
        return self._id

    @id.setter
    def id(self, id: str):
        self._id = id

    @property
    def client_id(self) -> str:
        return self._client_id

    @client_id.setter
    def client_id(self, client_id: str):
        self._client_id = client_id

    @property
    def status(self) -> str:
        return self._status

    @status.setter
    def status(self, status: str):
        self._status = status

    @property
    def created_at(self) -> datetime:
        return self._created_at

    @created_at.setter
    def created_at(self, created_at: datetime):
        self._created_at = created_at
