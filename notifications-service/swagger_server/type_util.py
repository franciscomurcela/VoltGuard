# coding: utf-8

import sys

if sys.version_info < (3, 7):
    import typing

    def is_generic(klass):
        return type(klass) == typing.GenericMeta

    def is_dict(klass):
        return klass.__extra__ == dict

    def is_list(klass):
        return klass.__extra__ == list

else:

    def is_generic(klass):
        return hasattr(klass, '__origin__')

    def is_dict(klass):
        return klass.__origin__ == dict

    def is_list(klass):
        return klass.__origin__ == list
