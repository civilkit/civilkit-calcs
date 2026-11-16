<template>
  <!-- calcpad-rs: Settings > Python, the way back from "Do not ask again on this device" (python-consent.ts). -->
  <section class="settings-section cprs-python">
    <h3 class="section-header" @click="open = !open">
      <span class="expand-icon" :class="{ collapsed: !open }">&#x25BC;</span>
      {{ t('settings.python.title') }}
    </h3>
    <div v-show="open" class="section-body">
      <p class="cprs-hint" data-python-state>{{ always ? t('settings.python.on') : t('settings.python.off') }}</p>
      <button class="btn cprs-python-ask" :disabled="!always" @click="ask">{{ t('settings.python.ask') }}</button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../i18n'
import { pythonAlwaysAllowed, resetPythonAlwaysAllowed } from './python-consent'

const open = ref(false)
const always = ref(pythonAlwaysAllowed())
function ask() {
  resetPythonAlwaysAllowed()
  always.value = pythonAlwaysAllowed()
}
</script>
