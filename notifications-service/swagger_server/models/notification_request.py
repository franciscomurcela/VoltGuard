# coding: utf-8

from __future__ import absolute_import
from datetime import date, datetime  # noqa: F401
from typing import List, Dict  # noqa: F401

from swagger_server.models.base_model_ import Model
from swagger_server import util


class NotificationRequest(Model):
    def __init__(self, client_id: str=None, target: str=None, channel: str=None, message_template: str=None, variables: object=None):  # noqa: E501
        self.swagger_types = {
            'client_id': str,
            'target': str,
            'channel': str,
            'message_template': str,
            'variables': object
        }
        self.attribute_map = {
            'client_id': 'client_id',
            'target': 'target',
            'channel': 'channel',
            'message_template': 'message_template',
            'variables': 'variables'
        }
        self._client_id = client_id
        self._target = target
        self._channel = channel
        self._message_template = message_template
        self._variables = variables

    @classmethod
    def from_dict(cls, dikt) -> 'NotificationRequest':
        return util.deserialize_model(dikt, cls)

    @property
    def client_id(self) -> str:
        return self._client_id

    @client_id.setter
    def client_id(self, client_id: str):
        if client_id is None:
            raise ValueError("Invalid value for `client_id`, must not be `None`")
        self._client_id = client_id

    @property
    def target(self) -> str:
        return self._target

    @target.setter
    def target(self, target: str):
        if target is None:
            raise ValueError("Invalid value for `target`, must not be `None`")
        self._target = target

    @property
    def channel(self) -> str:
        return self._channel

    @channel.setter
    def channel(self, channel: str):
        if channel is None:
            raise ValueError("Invalid value for `channel`, must not be `None`")
        self._channel = channel

    @property
    def message_template(self) -> str:
        return self._message_template

    @message_template.setter
    def message_template(self, message_template: str):
        if message_template is None:
            raise ValueError("Invalid value for `message_template`, must not be `None`")
        self._message_template = message_template

    @property
    def variables(self) -> object:
        return self._variables

    @variables.setter
    def variables(self, variables: object):
        self._variables = variables
