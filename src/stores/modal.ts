import { ref, markRaw, nextTick, type Component } from 'vue';
import { defineStore } from 'pinia';
import ConfirmDialog from '@/components/dialog/ConfirmDialog.vue';
import InputDialog from '@/components/dialog/InputDialog.vue';
import type { MessageType } from '@/constant/status';

export enum ModalType {
  CONFIRM,
  INPUT_DIALOG,
}

export interface ModalDataType {
  [ModalType.CONFIRM]: {
    type?: MessageType;
    title?: string;
    content: string;
    confirmText?: string;
    cancelText?: string;
    onOK: () => void;
    onCancel: () => void;
  };
  [ModalType.INPUT_DIALOG]: {
    title: string;
    tips?: string;
    defaultValue?: string;
    onOK: (value: string) => void | Promise<void>;
    onCancel?: () => void;
    okText?: string;
    cancelText?: string;
  };
}

export type ModalInstanceMap<T extends ModalType> = Record<
  T,
  {
    component: Component;
    onEnter?: (data: ModalDataType[T]) => void;
    onLeave?: () => void;
  }
>;

export const useModalStore = defineStore('modal', () => {
  const modalInstanceMap = ref<ModalInstanceMap<ModalType>>({
    [ModalType.CONFIRM]: {
      component: markRaw(ConfirmDialog),
    },
    [ModalType.INPUT_DIALOG]: {
      component: markRaw(InputDialog),
    },
  });
  const showModalList = ref<ModalType[]>([]);
  const pendingShows = new Map<ModalType, { data: ModalDataType[ModalType] }>();

  const showModal = <T extends ModalType>(modalType: T, data: ModalDataType[T]) => {
    if (showModalList.value.includes(modalType)) {
      // Settle the rejected request too, so useConfirm never leaves a pending Promise.
      data.onCancel?.();
      return;
    }
    const request = { data };
    pendingShows.set(modalType, request);
    showModalList.value.push(modalType);
    nextTick(() => {
      if (pendingShows.get(modalType) !== request) return;
      pendingShows.delete(modalType);
      modalInstanceMap.value[modalType].onEnter?.(data);
    });
  };

  const hideModal = (modalType: ModalType) => {
    const index = showModalList.value.findIndex((item) => item === modalType);
    if (index === -1) return;
    const pending = pendingShows.get(modalType);
    pendingShows.delete(modalType);
    showModalList.value.splice(index, 1);
    if (pending) {
      pending.data.onCancel?.();
    } else {
      modalInstanceMap.value[modalType].onLeave?.();
    }
  };

  return {
    modalInstanceMap,
    showModalList,
    showModal,
    hideModal,
  };
});
