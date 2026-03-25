# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401
from typing import List, Dict  # noqa: F401

from swagger_server.models.base_model_ import Model
from swagger_server import util


class ChannelRequest(Model):
    def __init__(self, name: str=None, provider: str=None, api_key: str=None):  # noqa: E501
        self.swagger_types = {'name': str, 'provider': str, 'api_key': str}
        self.attribute_map = {'name': 'name', 'provider': 'provider', 'api_key': 'api_key'}
        self._name = name
        self._provider = provider
        self._api_key = api_key

    @classmethod
    def from_dict(cls, dikt) -> 'ChannelRequest':
        return util.deserialize_model(dikt, cls)

    @property
    def name(self) -> str:
        return self._name

    @name.setter
    def name(self, name: str):
        if name is None:
            raise ValueError("Invalid value for `name`, must not be `None`")
        self._name = name

    @property
    def provider(self) -> str:
        return self._provider

    @provider.setter
    def provider(self, provider: str):
        if provider is None:
            raise ValueError("Invalid value for `provider`, must not be `None`")
        self._provider = provider

    @property
    def api_key(self) -> str:
        return self._api_key

    @api_key.setter
    def api_key(self, api_key: str):
        if api_key is None:
            raise ValueError("Invalid value for `api_key`, must not be `None`")
        self._api_key = api_key
