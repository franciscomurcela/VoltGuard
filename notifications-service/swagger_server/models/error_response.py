# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401
from typing import List, Dict  # noqa: F401

from swagger_server.models.base_model_ import Model
from swagger_server.models.error_response_error import ErrorResponseError  # noqa: F401,E501
from swagger_server import util


class ErrorResponse(Model):
    def __init__(self, error: ErrorResponseError=None):  # noqa: E501
        self.swagger_types = {'error': ErrorResponseError}
        self.attribute_map = {'error': 'error'}
        self._error = error

    @classmethod
    def from_dict(cls, dikt) -> 'ErrorResponse':
        return util.deserialize_model(dikt, cls)

    @property
    def error(self) -> ErrorResponseError:
        return self._error

    @error.setter
    def error(self, error: ErrorResponseError):
        self._error = error
