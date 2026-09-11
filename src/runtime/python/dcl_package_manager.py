import sys
import types

dcl_package_manager_module = types.ModuleType("dcl_package_manager")


def install_packages(packages):
    pass


def print_packages():
    pass


def get_packages(registry=None):
    return []


def get_registry():
    return {"packages": {}}


dcl_package_manager_module.install_packages = install_packages
dcl_package_manager_module.print_packages = print_packages
dcl_package_manager_module.get_packages = get_packages
dcl_package_manager_module.get_registry = get_registry
sys.modules["dcl_package_manager"] = dcl_package_manager_module
