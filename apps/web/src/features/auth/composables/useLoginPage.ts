import { reactive, ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import axios from 'axios';
import { useAuthStore } from '../../../stores/auth';
import { extractErrorMessage } from '../../../services/http-client';

type AuthStoreLike = { setAuth: (token: string, username: string) => void };

export async function performLogin(args: {
  username: string;
  password: string;
  authStore: AuthStoreLike;
  redirect: string;
  setError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
  navigate: (path: string) => void;
}): Promise<void> {
  if (!args.username.trim() || !args.password.trim()) {
    args.setError('请输入用户名和密码');
    return;
  }
  args.setLoading(true);
  args.setError(null);
  try {
    const baseURL = import.meta.env.VITE_API_BASE_URL || '/api';
    const res = await axios.post(`${baseURL}/auth/login`, {
      username: args.username.trim(),
      password: args.password.trim()
    });
    args.authStore.setAuth(res.data.access_token, res.data.username);
    ElMessage.success('登录成功');
    args.navigate(args.redirect);
  } catch (e: unknown) {
    args.setError(extractErrorMessage(e, '登录失败，请检查网络连接'));
  } finally {
    args.setLoading(false);
  }
}

export function resolveLoginRedirect(raw: unknown): string {
  return (Array.isArray(raw) ? raw[0] : raw) || '/';
}

export function useLoginPage() {
  const authStore = useAuthStore(),
    router = useRouter(),
    route = useRoute(),
    loading = ref(false),
    error = ref<string | null>(null),
    form = reactive({ username: '', password: '' });
  function fillDefaults() {
    form.username = 'admin';
    form.password = 'contentops2024';
    error.value = null;
  }
  async function handleLogin() {
    await performLogin({
      username: form.username,
      password: form.password,
      authStore,
      redirect: resolveLoginRedirect(route.query.redirect),
      setError: (msg) => {
        error.value = msg;
      },
      setLoading: (v) => {
        loading.value = v;
      },
      navigate: (path) => {
        router.push(path);
      }
    });
  }
  return { form, loading, error, fillDefaults, handleLogin };
}
