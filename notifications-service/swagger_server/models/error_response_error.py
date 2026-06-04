# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401
from typing import List, Dict  # noqa: F401

from swagger_server.models.base_model_ import Model
from swagger_server import util


class ErrorResponseError(Model):
    def __init__(self, message: str=None, type: str=None, code: int=None):  # noqa: E501
        self.swagger_types = {'message': str, 'type': str, 'code': int}
        self.attribute_map = {'message': 'message', 'type': 'type', 'code': 'code'}
        self._message = message
        self._type = type
        self._code = code

    @classmethod
    def from_dict(cls, dikt) -> 'ErrorResponseError':
        return util.deserialize_model(dikt, cls)

    @property
    def message(self) -> str:
        return self._message

    @message.setter
    def message(self, message: str):
        self._message = message

    @property
    def type(self) -> str:
        return self._type

    @type.setter
    def type(self, type: str):
        self._type = type

    @property
    def code(self) -> int:
        return self._code

    @code.setter
    def code(self, code: int):
        self._code = code
