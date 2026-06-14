{{/*
AI-ROS common labels
*/}}
{{- define "airos.labels" -}}
app.kubernetes.io/name: airos
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "airos.selectorLabels" -}}
app.kubernetes.io/name: airos
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
API labels
*/}}
{{- define "airos.apiLabels" -}}
{{ include "airos.labels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
API selector labels
*/}}
{{- define "airos.apiSelectorLabels" -}}
{{ include "airos.selectorLabels" . }}
app.kubernetes.io/component: api
{{- end }}

{{/*
Frontend labels
*/}}
{{- define "airos.frontendLabels" -}}
{{ include "airos.labels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Frontend selector labels
*/}}
{{- define "airos.frontendSelectorLabels" -}}
{{ include "airos.selectorLabels" . }}
app.kubernetes.io/component: frontend
{{- end }}

{{/*
Worker labels
*/}}
{{- define "airos.workerLabels" -}}
{{ include "airos.labels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Worker selector labels
*/}}
{{- define "airos.workerSelectorLabels" -}}
{{ include "airos.selectorLabels" . }}
app.kubernetes.io/component: worker
{{- end }}

{{/*
Full image path
*/}}
{{- define "airos.apiImage" -}}
{{ .Values.image.repository }}/airos-api:{{ .Values.image.tag }}
{{- end }}

{{- define "airos.frontendImage" -}}
{{ .Values.image.repository }}/airos-frontend:{{ .Values.image.tag }}
{{- end }}
